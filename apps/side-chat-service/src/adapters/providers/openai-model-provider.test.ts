import { streamText } from "ai";
import { describe, expect, it } from "vitest";

import { createOpenAIModelProvider } from "./openai-model-provider.js";

describe("createOpenAIModelProvider", () => {
  it("disables retention and the implicit detailed reasoning summary", async () => {
    let body: unknown;
    const provider = createOpenAIModelProvider({
      apiKey: "test-key",
      modelId: "gpt-5.4-mini",
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
    const resolved = provider.modelFor({
      modelId: "gpt-5.4-mini",
      requestId: "request-1",
    });

    const result = streamText({
      model: resolved.model,
      prompt: "hello",
      ...(resolved.providerOptions === undefined
        ? {}
        : { providerOptions: resolved.providerOptions }),
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
});

function sse(event: object): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
