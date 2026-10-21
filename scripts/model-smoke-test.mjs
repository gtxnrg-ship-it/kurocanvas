#!/usr/bin/env node
const baseUrl = (process.env.KURO_MODEL_BASE_URL || "http://127.0.0.1:8000/v1").replace(/\/+$/, "");
const apiKey = process.env.KURO_MODEL_API_KEY;
const requestedModel = process.env.KURO_MODEL_ID;

let endpoint;
try {
  endpoint = new URL(baseUrl);
} catch {
  console.error("KURO_MODEL_BASE_URL must be a valid URL.");
  process.exit(2);
}
const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && loopback)) {
  console.error("Use HTTPS for remote endpoints. Plain HTTP is allowed only for localhost/loopback.");
  process.exit(2);
}
if (endpoint.username || endpoint.password) {
  console.error("Do not put credentials in KURO_MODEL_BASE_URL; use KURO_MODEL_API_KEY.");
  process.exit(2);
}

const headers = { ...(apiKey ? { Authorization: "Bearer " + apiKey } : {}) };
async function request(path, init = {}) {
  const response = await fetch(baseUrl + path, {
    ...init,
    headers: { ...headers, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body.error?.message === "string" ? body.error.message : "HTTP " + response.status;
    throw new Error(path + " failed: " + detail);
  }
  return body;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  console.log("1/3 Checking model endpoint…");
  const modelPayload = await request("/models");
  const models = (modelPayload.data || []).filter(item => typeof item.id === "string" && item.id.length > 0);
  assert(models.length > 0, "The endpoint returned no model IDs.");
  const model = models.find(item => item.id === requestedModel) || (!requestedModel ? models[0] : undefined);
  assert(model, "Requested model ID was not returned. Available IDs: " + models.map(item => item.id).join(", "));
  console.log("   Connected. Selected model: " + model.id);

  console.log("2/3 Checking text generation…");
  const textPayload = await request("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: model.id,
      messages: [{ role: "user", content: "Reply with exactly: KURO_TEXT_OK" }],
      max_tokens: 48,
      temperature: 0,
      stream: false,
    }),
  });
  const text = textPayload.choices?.[0]?.message?.content;
  assert(typeof text === "string" && text.trim().length > 0, "Text generation returned no message.");
  console.log("   Text generation returned a response.");

  console.log("3/3 Checking image-input generation…");
  // A tiny valid PNG keeps the smoke test self-contained and does not send project art.
  const testImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=";
  const visionPayload = await request("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: model.id,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Briefly describe the attached test image. If you cannot process images, say so." },
          { type: "image_url", image_url: { url: testImage, detail: "high" } },
        ],
      }],
      max_tokens: 96,
      temperature: 0,
      stream: false,
    }),
  });
  const visionText = visionPayload.choices?.[0]?.message?.content;
  assert(typeof visionText === "string" && visionText.trim().length > 0, "Image-input request returned no message.");
  assert(!/cannot process images|don't support images|do not support images|unable to view images/i.test(visionText),
    "The server returned a response indicating image input may not be supported: " + visionText);
  console.log("   Image-input request returned a response.");
  console.log("\nPASS: endpoint, text generation, and image-input request all responded.");
  console.log("Note: this smoke test confirms API behavior, not creative quality, tool reliability, or ChatGPT parity.");
} catch (error) {
  console.error("\nFAIL: " + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
}
