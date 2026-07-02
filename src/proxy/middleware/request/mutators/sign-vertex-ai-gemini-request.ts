import { GcpKey, keyPool } from "../../../../shared/key-management";
import { ProxyReqMutator } from "../index";
import {
  getCredentialsFromGcpKey,
  refreshGcpAccessToken,
} from "../../../../shared/key-management/gcp/oauth";

const GCP_HOST = process.env.GCP_HOST || "%REGION%-aiplatform.googleapis.com";

/**
 * Signs a Vertex AI Gemini request. This is similar to the Anthropic Vertex AI
 * signer but targets the `google` publisher and uses the Gemini generateContent
 * API format instead of Anthropic's streamRawPredict.
 */
export const signGcpGeminiRequest: ProxyReqMutator = async (manager) => {
  const req = manager.request;
  const serviceValid = req.service === "gcp";
  if (!serviceValid) {
    throw new Error("signGcpGeminiRequest called on invalid request");
  }

  if (!req.body?.model) {
    throw new Error("You must specify a model with your request.");
  }

  const { model } = req.body;
  const key: GcpKey = keyPool.get(model, "gcp", undefined, undefined, req.body) as GcpKey;

  if (!key.accessToken || Date.now() > key.accessTokenExpiresAt) {
    const [token, durationSec] = await refreshGcpAccessToken(key);
    keyPool.update(key, {
      accessToken: token,
      accessTokenExpiresAt: Date.now() + durationSec * 1000 * 0.95,
    } as GcpKey);
    key.accessToken = token;
  }

  manager.setKey(key);
  req.log.info({ key: key.hash, model }, "Assigned GCP key to Gemini request");

  // Strip the request body to only known Gemini fields
  const payload = { ...req.body, stream: undefined, model: undefined };

  const credential = await getCredentialsFromGcpKey(key);
  const host = GCP_HOST.replace("%REGION%", credential.region);

  // Determine whether to stream based on request
  const isStreaming = req.body.stream || req.isStreaming;
  const action = isStreaming ? "streamGenerateContent?alt=sse" : "generateContent";

  manager.setSignedRequest({
    method: "POST",
    protocol: "https:",
    hostname: host,
    path: `/v1/projects/${credential.projectId}/locations/${credential.region}/publishers/google/models/${model}:${action}`,
    headers: {
      ["host"]: host,
      ["content-type"]: "application/json",
      ["authorization"]: `Bearer ${key.accessToken}`,
    },
    body: JSON.stringify(payload),
  });
};
