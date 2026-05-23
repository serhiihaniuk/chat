import { describe, expect, it } from "vitest";
import {
  createOpenAIResponsesProvider,
  OPENAI_PROVIDER_ID,
  OPENAI_RESPONSES_URL,
} from "./openai-responses-provider.js";

describe("createOpenAIResponsesProvider", () => {
  it("maps OpenAI Responses SSE text events into runtime events", async () => {
    const calls: RequestInit[] = [];
    const provider = createOpenAIResponsesProvider({
      apiKey: "test-key",
      modelIds: ["gpt-5-mini"],
      fetch: (_url, init) => {
        calls.push(init ?? {});
        return Promise.resolve(
          new Response(
            [
              sse({
                type: "response.output_text.delta",
                delta: "Hello ",
              }),
              sse({
                type: "response.output_text.delta",
                delta: "world",
              }),
              sse({
                type: "response.completed",
                response: {
                  usage: {
                    input_tokens: 5,
                    output_tokens: 2,
                    total_tokens: 7,
                  },
                },
              }),
            ].join(""),
            { status: 200 },
          ),
        );
      },
    });

    const events = await collect(
      provider.stream({
        requestId: "request_001",
        assistantTurnId: "turn_001",
        modelId: "gpt-5-mini",
        messages: [{ role: "user", content: "hello" }],
      }),
    );

    expect(events.map((event) => event.type)).toEqual([
      "runtime.started",
      "runtime.completed",
    ]);
    expect(events[0]).toMatchObject({
      providerId: OPENAI_PROVIDER_ID,
      modelId: "gpt-5-mini",
      sequence: 0,
    });
    expect(events.at(-1)).toMatchObject({
      type: "runtime.completed",
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
    });
    expect(calls[0]?.headers).toMatchObject({
      authorization: "Bearer test-key",
    });
    const body = calls[0]?.body;
    expect(typeof body).toBe("string");
    expect(JSON.parse(body as string)).toMatchObject({
      model: "gpt-5-mini",
      input: [
        { role: "user", content: [{ type: "input_text", text: "hello" }] },
      ],
    });
  });

  it("turns provider HTTP failures into runtime errors without fallback", async () => {
    const provider = createOpenAIResponsesProvider({
      apiKey: "test-key",
      modelIds: ["gpt-5-mini"],
      fetch: (url) => {
        expect(url).toBe(OPENAI_RESPONSES_URL);
        return Promise.resolve(new Response("nope", { status: 503 }));
      },
    });

    await expect(
      collect(
        provider.stream({
          requestId: "request_002",
          assistantTurnId: "turn_002",
          modelId: "gpt-5-mini",
          messages: [{ role: "user", content: "hello" }],
        }),
      ),
    ).resolves.toMatchObject([
      { type: "runtime.started", sequence: 0 },
      {
        type: "runtime.error",
        requestId: "request_002",
        assistantTurnId: "turn_002",
        sequence: 1,
        code: "provider_unavailable",
        retryable: true,
      },
    ]);
  });

  it("requires explicit credentials and model allowlist", () => {
    expect(() =>
      createOpenAIResponsesProvider({ apiKey: "", modelIds: ["gpt-5-mini"] }),
    ).toThrow("requires an API key");
    expect(() =>
      createOpenAIResponsesProvider({ apiKey: "test-key", modelIds: [] }),
    ).toThrow("requires at least one allowed model");
  });
});

const sse = (payload: object): string =>
  `event: ${"type" in payload ? String(payload.type) : "message"}\n` +
  `data: ${JSON.stringify(payload)}\n\n`;

const collect = async <T>(events: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};
