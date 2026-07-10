import { describe, expect, it } from "vitest";
import { Stream } from "effect";
import type { AiRuntimeRequest } from "@side-chat/ai-runtime-contract";
import { isRecord, parseJsonRecord } from "@side-chat/shared";
import { createAgentRuntime } from "#runtime/agent-runtime";
import { RUNTIME_PROVIDER_ERROR_PUBLIC_MESSAGE } from "#runtime/ai-sdk/streaming/stream-part-mapper";
import {
  createOpenAIResponsesProvider,
  OPENAI_PROVIDER_ID,
  OPENAI_RESPONSES_URL,
} from "./openai-model-provider.js";

describe("createOpenAIResponsesProvider", () => {
  it("resolves an OpenAI Responses model for runtime execution", async () => {
    const calls: RequestInit[] = [];
    const runtime = createAgentRuntime({
      // Disable text batching so this provider test asserts one delta per chunk.
      flushIntervalMs: 0,
      providers: [
        createOpenAIResponsesProvider({
          apiKey: "test-key",
          modelIds: ["gpt-5.4-mini"],
          fetch: (_url, init) => {
            calls.push(init ?? {});
            return Promise.resolve(
              new Response(
                [
                  sse({
                    type: "response.output_item.added",
                    output_index: 0,
                    item: { type: "message", id: "msg_001" },
                  }),
                  sse({
                    type: "response.output_text.delta",
                    item_id: "msg_001",
                    delta: "Hello ",
                  }),
                  sse({
                    type: "response.output_text.delta",
                    item_id: "msg_001",
                    delta: "world",
                  }),
                  sse({
                    type: "response.output_item.done",
                    output_index: 0,
                    item: { type: "message", id: "msg_001" },
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
        }),
      ],
    });

    const request = runtimeRequest({
      requestId: "request_001",
      assistantTurnId: "turn_001",
      providerId: OPENAI_PROVIDER_ID,
      modelId: "gpt-5.4-mini",
      messages: [
        {
          role: "system",
          content: "Use GitHub-flavored Markdown.",
        },
        { role: "user", content: "hello" },
      ],
    });
    const events = await collect(Stream.toAsyncIterable(runtime.streamEffect(request)));

    expect(events.map((event) => event.type)).toEqual([
      "runtime.started",
      "runtime.output_delta",
      "runtime.output_delta",
      "runtime.completed",
    ]);
    expect(events[0]).toMatchObject({
      providerId: OPENAI_PROVIDER_ID,
      modelId: "gpt-5.4-mini",
      sequence: 0,
    });
    expect(events[1]).toMatchObject({
      type: "runtime.output_delta",
      content: "Hello ",
      sequence: 1,
    });
    expect(events[2]).toMatchObject({
      type: "runtime.output_delta",
      content: "world",
      sequence: 2,
    });
    expect(events.at(-1)).toMatchObject({
      type: "runtime.completed",
      sequence: 3,
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
    });
    expect(calls[0]?.headers).toMatchObject({
      authorization: "Bearer test-key",
    });
    const parsedBody = parseRequestBody(calls[0]?.body);
    expect(parsedBody).toMatchObject({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "developer",
          content: expect.stringContaining("GitHub-flavored Markdown"),
        },
        { role: "user", content: [{ type: "input_text", text: "hello" }] },
      ],
      reasoning: { effort: "medium" },
    });
    // OpenAI retention is disabled, and no reasoning summary is requested by default.
    expect(parsedBody["store"]).toBe(false);
    expect(reasoningField(parsedBody)["summary"]).toBeUndefined();
  });

  it("sends an explicitly configured reasoning summary when one is set", async () => {
    const calls: RequestInit[] = [];
    const runtime = createAgentRuntime({
      // Disable text batching so this provider test asserts one delta per chunk.
      flushIntervalMs: 0,
      providers: [
        createOpenAIResponsesProvider({
          apiKey: "test-key",
          modelIds: ["gpt-5.4-mini"],
          reasoningSummary: "concise",
          fetch: (_url, init) => {
            calls.push(init ?? {});
            return Promise.resolve(
              new Response(sse({ type: "response.completed", response: { usage: {} } }), {
                status: 200,
              }),
            );
          },
        }),
      ],
    });

    await collect(
      Stream.toAsyncIterable(
        runtime.streamEffect(
          runtimeRequest({
            providerId: OPENAI_PROVIDER_ID,
            modelId: "gpt-5.4-mini",
            messages: [{ role: "user", content: "hello" }],
          }),
        ),
      ),
    );

    const parsedBody = parseRequestBody(calls[0]?.body);
    expect(parsedBody["store"]).toBe(false);
    expect(reasoningField(parsedBody)).toMatchObject({ effort: "medium", summary: "concise" });
  });

  it("lets a runtime reasoning selection override the provider default effort", async () => {
    const calls: RequestInit[] = [];
    const runtime = createAgentRuntime({
      // Disable text batching so this provider test asserts one delta per chunk.
      flushIntervalMs: 0,
      providers: [
        createOpenAIResponsesProvider({
          apiKey: "test-key",
          modelIds: ["gpt-5.4-mini"],
          reasoningEffort: "medium",
          fetch: (_url, init) => {
            calls.push(init ?? {});
            return Promise.resolve(
              new Response(sse({ type: "response.completed", response: { usage: {} } }), {
                status: 200,
              }),
            );
          },
        }),
      ],
    });

    await collect(
      Stream.toAsyncIterable(
        runtime.streamEffect(
          runtimeRequest({
            providerId: OPENAI_PROVIDER_ID,
            modelId: "gpt-5.4-mini",
            reasoning: { effort: "high" },
            messages: [{ role: "user", content: "hello" }],
          }),
        ),
      ),
    );

    expect(reasoningField(parseRequestBody(calls[0]?.body))).toMatchObject({ effort: "high" });
  });

  it("sends a configured maxOutputTokens in the Responses request body", async () => {
    const calls: RequestInit[] = [];
    const runtime = createAgentRuntime({
      flushIntervalMs: 0,
      providers: [
        createOpenAIResponsesProvider({
          apiKey: "test-key",
          modelIds: ["gpt-5.4-mini"],
          fetch: (_url, init) => {
            calls.push(init ?? {});
            return Promise.resolve(
              new Response(sse({ type: "response.completed", response: { usage: {} } }), {
                status: 200,
              }),
            );
          },
        }),
      ],
    });

    await collect(
      Stream.toAsyncIterable(
        runtime.streamEffect(
          runtimeRequest({
            providerId: OPENAI_PROVIDER_ID,
            modelId: "gpt-5.4-mini",
            // temperature/topP are also threaded, but OpenAI drops them for a
            // reasoning model; maxOutputTokens is the portable knob the wire carries.
            callSettings: { maxOutputTokens: 256, temperature: 0.2, topP: 0.9 },
            messages: [{ role: "user", content: "hello" }],
          }),
        ),
      ),
    );

    expect(parseRequestBody(calls[0]?.body)).toMatchObject({ max_output_tokens: 256 });
  });

  it("omits maxOutputTokens from the body when no call settings are configured", async () => {
    const calls: RequestInit[] = [];
    const runtime = createAgentRuntime({
      flushIntervalMs: 0,
      providers: [
        createOpenAIResponsesProvider({
          apiKey: "test-key",
          modelIds: ["gpt-5.4-mini"],
          fetch: (_url, init) => {
            calls.push(init ?? {});
            return Promise.resolve(
              new Response(sse({ type: "response.completed", response: { usage: {} } }), {
                status: 200,
              }),
            );
          },
        }),
      ],
    });

    await collect(
      Stream.toAsyncIterable(
        runtime.streamEffect(
          runtimeRequest({
            providerId: OPENAI_PROVIDER_ID,
            modelId: "gpt-5.4-mini",
            messages: [{ role: "user", content: "hello" }],
          }),
        ),
      ),
    );

    expect(parseRequestBody(calls[0]?.body)["max_output_tokens"]).toBeUndefined();
  });

  it("omits the reasoning option for a non-reasoning selection so OpenAI does not 400", async () => {
    const calls: RequestInit[] = [];
    const runtime = createAgentRuntime({
      flushIntervalMs: 0,
      providers: [
        createOpenAIResponsesProvider({
          apiKey: "test-key",
          modelIds: ["gpt-5.4-mini"],
          fetch: (_url, init) => {
            calls.push(init ?? {});
            return Promise.resolve(
              new Response(sse({ type: "response.completed", response: { usage: {} } }), {
                status: 200,
              }),
            );
          },
        }),
      ],
    });

    await collect(
      Stream.toAsyncIterable(
        runtime.streamEffect(
          runtimeRequest({
            providerId: OPENAI_PROVIDER_ID,
            modelId: "gpt-5.4-mini",
            reasoning: { effort: "none" },
            messages: [{ role: "user", content: "hello" }],
          }),
        ),
      ),
    );

    const parsedBody = parseRequestBody(calls[0]?.body);
    expect(parsedBody["store"]).toBe(false);
    // A non-reasoning model must receive no reasoning effort at all.
    expect(parsedBody["reasoning"]).toBeUndefined();
  });

  it("turns provider HTTP failures into a public-safe runtime error without leaking raw text", async () => {
    const runtime = createAgentRuntime({
      providers: [
        createOpenAIResponsesProvider({
          apiKey: "test-key",
          modelIds: ["gpt-5.4-mini"],
          fetch: (url) => {
            expect(url).toBe(OPENAI_RESPONSES_URL);
            return Promise.resolve(
              new Response("raw provider secret detail leak", { status: 503 }),
            );
          },
        }),
      ],
    });
    const request = runtimeRequest({
      requestId: "request_002",
      assistantTurnId: "turn_002",
      providerId: OPENAI_PROVIDER_ID,
      modelId: "gpt-5.4-mini",
      messages: [{ role: "user", content: "hello" }],
    });

    const events = await collect(Stream.toAsyncIterable(runtime.streamEffect(request)));

    expect(events[0]).toMatchObject({ type: "runtime.started", sequence: 0 });
    const errorEvent = events.at(-1);
    expect(errorEvent).toMatchObject({
      type: "runtime.error",
      code: "provider_unavailable",
      retryable: true,
      message: RUNTIME_PROVIDER_ERROR_PUBLIC_MESSAGE,
    });
    // The raw provider body must never reach a browser-visible runtime error.
    expect(errorEvent && "message" in errorEvent ? errorEvent.message : "").not.toContain(
      "raw provider secret detail leak",
    );
  });

  it("requires explicit credentials and model allowlist", () => {
    expect(() => createOpenAIResponsesProvider({ apiKey: "", modelIds: ["gpt-5.4-mini"] })).toThrow(
      "requires an API key",
    );
    expect(() => createOpenAIResponsesProvider({ apiKey: "test-key", modelIds: [] })).toThrow(
      "requires at least one allowed model",
    );
  });
});

const parseRequestBody = (body: RequestInit["body"]): Record<string, unknown> => {
  if (typeof body !== "string") throw new Error("Expected a string request body.");
  const parsed = parseJsonRecord(body);
  if (!parsed) throw new Error("Expected a JSON object request body.");
  return parsed;
};

const reasoningField = (body: Record<string, unknown>): Record<string, unknown> => {
  const reasoning = body["reasoning"];
  return isRecord(reasoning) ? reasoning : {};
};

const sse = (payload: object): string =>
  `event: ${"type" in payload ? String(payload.type) : "message"}\n` +
  `data: ${JSON.stringify(payload)}\n\n`;

const collect = async <T>(events: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};

const runtimeRequest = (overrides: Partial<AiRuntimeRequest>): AiRuntimeRequest => ({
  executorId: "ai_sdk.tool_loop",
  providerId: OPENAI_PROVIDER_ID,
  modelId: "gpt-5.4-mini",
  requestId: "request_default",
  assistantTurnId: "turn_default",
  messages: [],
  toolNames: [],
  toolScope: {
    hostAppId: "host_app_001",
    workspaceId: "workspace_001",
    subjectId: "subject_001",
    conversationId: "conversation_001",
    assistantTurnId: "turn_default",
  },
  ...overrides,
});
