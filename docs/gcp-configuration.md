# Configuring the proxy for Vertex AI (GCP)

The proxy supports GCP models via two endpoints:

- **Claude**: `/proxy/gcp/claude` — Anthropic Claude models via Vertex AI
- **Gemini**: `/proxy/gcp/gemini` — Google Gemini models via Vertex AI

There are a few extra steps necessary to use GCP compared to the other supported APIs.

- [Setting keys](#setting-keys)
- [Setup Vertex AI](#setup-vertex-ai)
- [Supported model IDs](#supported-model-ids)

## Setting keys

Use the `GCP_CREDENTIALS` environment variable to set the GCP API keys.

Like other APIs, you can provide multiple keys separated by commas. Each GCP key, however, is a set of credentials including the project id, client email, region and private key. These are separated by a colon (`:`).

For example:

```
GCP_CREDENTIALS=my-first-project:xxx@yyy.com:us-east5:-----BEGIN PRIVATE KEY-----xxx-----END PRIVATE KEY-----,my-first-project2:xxx2@yyy.com:us-east5:-----BEGIN PRIVATE KEY-----xxx-----END PRIVATE KEY-----
```

The same credentials are used for both Claude and Gemini endpoints.

## Setup Vertex AI

1. Go to [https://cloud.google.com/vertex-ai](https://cloud.google.com/vertex-ai) and sign up for a GCP account. ($150 free credits without credit card or $300 free credits with credit card, credits expire in 90 days)
2. Go to [https://console.cloud.google.com/marketplace/product/google/aiplatform.googleapis.com](https://console.cloud.google.com/marketplace/product/google/aiplatform.googleapis.com) to enable Vertex AI API.
3. Go to [https://console.cloud.google.com/vertex-ai](https://console.cloud.google.com/vertex-ai) and navigate to Model Garden to apply for access to the Claude models and/or enable the Gemini API.
4. Create a [Service Account](https://console.cloud.google.com/projectselector/iam-admin/serviceaccounts/create?walkthrough_id=iam--create-service-account#step_index=1) , and make sure to grant the role of "Vertex AI User" or "Vertex AI Administrator".
5. On the service account page you just created, create a new key and select "JSON". The JSON file will be downloaded automatically.
6. The required credential is in the JSON file you just downloaded.

## Supported model IDs

Users can send these model IDs to the proxy to invoke the corresponding models.

### Claude (via `/proxy/gcp/claude`)

- **Claude**
  - `claude-3-haiku@20240307`
  - `claude-3-sonnet@20240229`
  - `claude-3-opus@20240229`
  - `claude-3-5-sonnet@20240620`

### Gemini (via `/proxy/gcp/gemini`)

- **Gemini 2.5**
  - `gemini-2.5-pro`
- **Gemini 3**
  - `gemini-3-pro-image-preview`
- **Gemini 3.1**
  - `gemini-3.1-pro-preview`
  - `gemini-3.1-flash-image-preview`

The Gemini endpoint supports both the native Google AI format and an OpenAI-compatible format (`/v1/chat/completions`).
