import { streamText } from "ai";
import { isSideChatReasoningEffort, type SideChatReasoningEffort } from "@side-chat/stream-profile";
import { describe, expect, it } from "vitest";

import { OPENAI_PROVIDER } from "#config/providers/openai-provider-config";

import { createOpenAIModelAdapter } from "./openai-model-provider.js";

describe("createOpenAIModelAdapter", () => {
  it("disables retention and the implicit detailed reasoning summary", async () => {
    let body: unknown;
    const provider = createOpenAIModelAdapter({
      apiKey: "test-key",
      modelId: "gpt-5.6-luna",
      titleModelId: "gpt-5.6-luna",
      reasoningEffort: "medium",
      fetch: (_url, init) => {
        body = JSON.parse(String(init?.body));
        return Promise.resolve(
          new Response(sse({ type: "response.completed", response: { usage: {} } }), {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
        );
      },
    });
    const resolved = provider.modelFor("gpt-5.6-luna");

    const result = streamText({
      model: resolved,
      prompt: "hello",
      providerOptions: provider.providerOptions,
    });
    for await (const _part of result.fullStream) {
      // Consuming the stream makes the mocked provider request observable.
    }

    if (!isRecord(body) || !isRecord(body["reasoning"])) {
      throw new Error("OpenAI request must contain a reasoning object");
    }
    expect(body["store"]).toBe(false);
    expect(body["reasoning"]).toMatchObject({ effort: "medium" });
    expect(body["reasoning"]["summary"]).toBeUndefined();
  });

  it("changes the OpenAI reasoning option for each per-turn effort", async () => {
    const efforts: SideChatReasoningEffort[] = [];
    const provider = createOpenAIModelAdapter({
      apiKey: "test-key",
      modelId: "gpt-5.6-luna",
      titleModelId: "gpt-5.6-luna",
      reasoningEffort: "medium",
      fetch: (_url, init) => {
        const body: unknown = JSON.parse(String(init?.body));
        if (isRecord(body) && isRecord(body["reasoning"])) {
          const effort = body["reasoning"]["effort"];
          if (isSideChatReasoningEffort(effort)) efforts.push(effort);
        }
        return Promise.resolve(
          new Response(sse({ type: "response.completed", response: { usage: {} } }), {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
        );
      },
    });

    const supportedEfforts = OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.SUPPORTED_REASONING_EFFORTS;
    for (const effort of supportedEfforts) {
      const result = streamText({
        model: provider.modelFor("gpt-5.6-luna"),
        prompt: "hello",
        providerOptions: provider.providerOptionsFor(effort),
      });
      for await (const _part of result.fullStream) {
        // Consume each request so the mocked provider observes every override.
      }
    }

    expect(efforts).toEqual(supportedEfforts);
  });
});

function sse(event: object): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
