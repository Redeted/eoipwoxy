import { Request, RequestHandler, Router } from "express";
import { v4 } from "uuid";
import { config } from "../config";
import { GcpKey, keyPool } from "../shared/key-management";
import { ipLimiter } from "./rate-limit";
import {
  createPreprocessorMiddleware,
  finalizeSignedRequest,
  signGcpGeminiRequest,
} from "./middleware/request";
import { ProxyResHandlerWithBody } from "./middleware/response";
import { createQueuedProxyMiddleware } from "./middleware/request/proxy-middleware-factory";

let modelsCache: any = null;
let modelsCacheTime = 0;

/**
 * Gemini model variants available on GCP Vertex AI.
 * These use the `publishers/google` publisher endpoint.
 */
const GEMINI_VARIANTS = [
  // Gemini 2.5 models
  "gemini-2.5-pro",
  // Gemini 3 models
  "gemini-3-pro-image-preview",
  // Gemini 3.1 models
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-image-preview",
];

const getModelsResponse = () => {
  if (new Date().getTime() - modelsCacheTime < 1000 * 60) {
    return modelsCache;
  }

  if (!config.gcpCredentials) return { object: "list", data: [] };

  const models = GEMINI_VARIANTS.map((id) => ({
    id,
    object: "model",
    created: new Date().getTime(),
    owned_by: "google",
    permission: [],
    root: "google",
    parent: null,
  }));

  modelsCache = { object: "list", data: models };
  modelsCacheTime = new Date().getTime();

  return modelsCache;
};

const handleModelRequest: RequestHandler = (_req, res) => {
  res.status(200).json(getModelsResponse());
};

/**
 * Transforms a Google AI (Vertex AI Gemini) response to OpenAI format.
 */
function transformGeminiResponseToOpenAI(
  resBody: Record<string, any>,
  req: Request
): Record<string, any> {
  const totalTokens = (req.promptTokens ?? 0) + (req.outputTokens ?? 0);

  let content = "";
  if (resBody.candidates && resBody.candidates[0]) {
    const candidate = resBody.candidates[0];
    if (candidate.content?.parts && candidate.content.parts[0]?.text) {
      content = candidate.content.parts[0].text;
    } else if (candidate.content?.text) {
      content = candidate.content.text;
    }
  }

  return {
    id: "gcp-gem-" + v4(),
    object: "chat.completion",
    created: Date.now(),
    model: req.body.model,
    usage: {
      prompt_tokens: req.promptTokens,
      completion_tokens: req.outputTokens,
      total_tokens: totalTokens,
    },
    choices: [
      {
        message: { role: "assistant", content },
        finish_reason: resBody.candidates?.[0]?.finishReason || "STOP",
        index: 0,
      },
    ],
  };
}

const gcpGeminiBlockingResponseHandler: ProxyResHandlerWithBody = async (
  _proxyRes,
  req,
  res,
  body
) => {
  if (typeof body !== "object") {
    throw new Error("Expected body to be an object");
  }

  let newBody = body;
  if (req.inboundApi === "openai") {
    req.log.info("Transforming Vertex AI Gemini response to OpenAI format");
    newBody = transformGeminiResponseToOpenAI(body, req);
  }

  res.status(200).json({ ...newBody, proxy: body.proxy });
};

const gcpGeminiProxy = createQueuedProxyMiddleware({
  target: ({ signedRequest }) => {
    if (!signedRequest) throw new Error("Must sign request before proxying");
    return `${signedRequest.protocol}//${signedRequest.hostname}`;
  },
  mutations: [signGcpGeminiRequest, finalizeSignedRequest],
  blockingResponseHandler: gcpGeminiBlockingResponseHandler,
});

/**
 * Extracts and normalizes the model ID from the request. Handles multiple
 * URL formats sent by various frontends:
 *
 * - Body: `{ "model": "gemini-2.5-pro" }`
 * - Google AI Studio style: `/v1beta/models/gemini-2.5-pro:generateContent`
 * - Vertex AI style: `/v1/publishers/google/models/gemini-2.5-pro:generateContent`
 * - Simple: `/v1/models/gemini-2.5-pro:generateContent`
 */
function maybeReassignModel(req: Request) {
  // Try body first
  let model = req.body.model;

  // If not in body, extract from URL path
  if (!model) {
    // Match patterns like:
    //   /models/gemini-2.5-pro:generateContent
    //   /publishers/google/models/gemini-2.5-pro:streamGenerateContent
    const urlMatch = req.url.match(/\/models\/([^/:?]+)/);
    if (urlMatch) {
      model = urlMatch[1];
    }
  }

  if (!model) {
    throw new Error("You must specify a model with your request.");
  }

  // Strip 'models/' prefix if somehow still present
  if (model.startsWith("models/")) {
    model = model.slice("models/".length);
  }

  req.body.model = model;
}

function setStreamFlag(req: Request) {
  const isStreaming = req.url.includes("streamGenerateContent");
  if (isStreaming) {
    req.body.stream = true;
    req.isStreaming = true;
  } else {
    req.body.stream = false;
    req.isStreaming = false;
  }
}

const nativeGeminiPreprocessor = createPreprocessorMiddleware(
  { inApi: "google-ai", outApi: "google-ai", service: "gcp" },
  {
    beforeTransform: [maybeReassignModel],
    afterTransform: [setStreamFlag],
  }
);

const gcpGeminiRouter = Router();
gcpGeminiRouter.get("/v1/models", handleModelRequest);
// SillyTavern Google AI Studio source also requests models at /v1beta/models
gcpGeminiRouter.get("/:apiVersion(v1|v1alpha|v1beta)/models", handleModelRequest);

// Native Google AI generateContent endpoint: /v1/models/:modelId:action
gcpGeminiRouter.post(
  "/v1/models/:modelId:(generateContent|streamGenerateContent)",
  ipLimiter,
  nativeGeminiPreprocessor,
  gcpGeminiProxy
);

// SillyTavern Google AI Studio format: /v1beta/models/:modelId:action (with ?key=... ignored)
gcpGeminiRouter.post(
  "/:apiVersion(v1alpha|v1beta)/models/:modelId:(generateContent|streamGenerateContent)",
  ipLimiter,
  nativeGeminiPreprocessor,
  gcpGeminiProxy
);

// SillyTavern Vertex AI format: /v1/publishers/google/models/:modelId:action
gcpGeminiRouter.post(
  "/v1/publishers/google/models/:modelId:(generateContent|streamGenerateContent)",
  ipLimiter,
  nativeGeminiPreprocessor,
  gcpGeminiProxy
);

// OpenAI-to-Vertex AI Gemini compatibility endpoint.
gcpGeminiRouter.post(
  "/v1/chat/completions",
  ipLimiter,
  createPreprocessorMiddleware(
    { inApi: "openai", outApi: "google-ai", service: "gcp" },
    {
      afterTransform: [maybeReassignModel],
    }
  ),
  gcpGeminiProxy
);

export const gcpGemini = gcpGeminiRouter;
