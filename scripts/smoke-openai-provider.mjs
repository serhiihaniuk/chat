import { createPartnerAiServiceApp } from "../apps/partner-ai-service/src/inbound/http/app.js";
import { createPartnerAiServiceOptionsFromEnv } from "../apps/partner-ai-service/src/config/service-config.js";
import { SIDECHAT_PROTOCOL_VERSION } from "../packages/chat-protocol/src/index.js";

if (process.env["SIDECHAT_PROVIDER"] !== "openai") {
  throw new Error("Set SIDECHAT_PROVIDER=openai for the live provider smoke.");
}
if (process.env["SIDECHAT_LIVE_PROVIDER_SMOKE"] !== "approved") {
  throw new Error(
    "Set SIDECHAT_LIVE_PROVIDER_SMOKE=approved to acknowledge live provider data use.",
  );
}

const token = process.env["SIDECHAT_AUTH_BEARER_TOKEN"] ?? "local-smoke-token";
const app = createPartnerAiServiceApp(
  createPartnerAiServiceOptionsFromEnv({
    ...process.env,
    SIDECHAT_AUTH_BEARER_TOKEN: token,
  }),
);

const response = await app.request("/chat/stream", {
  method: "POST",
  headers: {
    authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    protocolVersion: SIDECHAT_PROTOCOL_VERSION,
    requestId: `request_live_${Date.now()}`,
    message: {
      id: `message_live_${Date.now()}`,
      role: "user",
      content: "Reply with exactly: ok",
    },
    hostContext: {
      schemaVersion: "host.v1",
      origin: "live-provider-smoke",
    },
  }),
});

if (!response.ok) {
  throw new Error(`Live provider smoke failed with HTTP ${response.status}.`);
}

const body = await response.text();
if (!body.includes("sidechat.completed")) {
  throw new Error("Live provider smoke did not complete a sidechat stream.");
}

console.log("Live provider smoke completed.");
