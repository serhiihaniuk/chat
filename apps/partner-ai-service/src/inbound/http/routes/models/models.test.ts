import { SIDECHAT_EVENT_TYPES, SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { parseJsonRecord } from "@side-chat/shared";
import { describe, expect, it } from "vitest";

import {
  createDevelopmentPartnerAiServiceApp,
  type DevelopmentPartnerAiServiceOptions,
} from "../../app.js";
import {
  TEST_SAFETY_POLL_INTERVAL_MS,
  runTurnStream,
} from "#testing/turn-stream/turn-stream-harness.test-support";

const validRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_models_001",
  message: { id: "message_models_001", content: "hello model policy" },
};

describe("partner ai service model catalog", () => {
  it("exposes fake demo thinking levels in the local model catalog", async () => {
    const response = await createDevelopmentPartnerAiServiceApp().request("/models", {
      headers: { authorization: "Bearer local-test-token" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      defaultModel: { providerId: "fake", modelId: "fake-echo" },
      models: [
        {
          providerId: "fake",
          modelId: "fake-echo",
          displayName: "fake-echo",
          default: true,
          available: true,
          reasoning: { defaultEffort: "medium", efforts: ["low", "medium", "high"] },
        },
      ],
    });
  });

  it("exposes the configured backend model catalog with reasoning and context windows", async () => {
    const response = await createDevelopmentPartnerAiServiceApp({
      runtime: openAiRuntimeOptions(),
    }).request("/models", { headers: { authorization: "Bearer local-test-token" } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      defaultModel: { providerId: "openai", modelId: "gpt-5.4-mini" },
      models: [
        {
          providerId: "openai",
          modelId: "gpt-5.4-mini",
          displayName: "GPT-5.4 mini",
          contextWindowTokens: 400_000,
          maxOutputTokens: 128_000,
          default: true,
          available: true,
          reasoning: { defaultEffort: "medium", efforts: ["low", "medium", "high"] },
        },
        {
          providerId: "openai",
          modelId: "gpt-5.5-mini",
          displayName: "GPT-5.5 mini",
          contextWindowTokens: 1_000_000,
          default: false,
          available: true,
          reasoning: { defaultEffort: "medium", efforts: ["low", "medium", "high"] },
        },
      ],
    });
  });

  it("sends the request-selected backend model and reasoning effort to runtime", async () => {
    const providerCalls: RequestInit[] = [];
    const app = createDevelopmentPartnerAiServiceApp({
      resumability: { safetyPollIntervalMs: TEST_SAFETY_POLL_INTERVAL_MS },
      runtime: openAiRuntimeOptions({
        fetch: (_url, init) => {
          providerCalls.push(init ?? {});
          return Promise.resolve(
            new Response(sse({ type: "response.completed", response: { usage: {} } }), {
              status: 200,
            }),
          );
        },
      }),
    });

    const { events } = await runTurnStream(app, {
      ...validRequest,
      model: { providerId: "openai", modelId: "gpt-5.5-mini", reasoningEffort: "high" },
    });

    expect(events.at(-1)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.COMPLETED });
    expect(parseProviderRequestBody(providerCalls[0]?.body)).toMatchObject({
      model: "gpt-5.5-mini",
      reasoning: { effort: "high" },
    });
  });
});

type OpenAiRuntimeOptions = Extract<
  NonNullable<DevelopmentPartnerAiServiceOptions["runtime"]>,
  { readonly provider: "openai" }
>;

const openAiRuntimeOptions = (overrides: Partial<OpenAiRuntimeOptions> = {}) => ({
  provider: "openai" as const,
  apiKey: "test-key",
  modelIds: ["gpt-5.4-mini", "gpt-5.5-mini"],
  defaultModelId: "gpt-5.4-mini",
  modelMetadata: [
    {
      modelId: "gpt-5.4-mini",
      displayName: "GPT-5.4 mini",
      contextWindowTokens: 400_000,
      maxOutputTokens: 128_000,
    },
    {
      modelId: "gpt-5.5-mini",
      displayName: "GPT-5.5 mini",
      contextWindowTokens: 1_000_000,
    },
  ],
  reasoningEffort: "medium" as const,
  reasoningEfforts: ["low", "medium", "high"] as const,
  ...overrides,
});

const parseProviderRequestBody = (body: RequestInit["body"]): Record<string, unknown> => {
  if (typeof body !== "string") throw new Error("Expected a string provider request body.");
  const parsed = parseJsonRecord(body);
  if (!parsed) throw new Error("Expected a JSON object provider request body.");
  return parsed;
};

const sse = (payload: object): string =>
  `event: ${"type" in payload ? String(payload.type) : "message"}\n` +
  `data: ${JSON.stringify(payload)}\n\n`;
