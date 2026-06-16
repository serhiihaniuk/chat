import { describe, expect, it } from "vitest";
import { Stream } from "effect";
import type { AiRuntimeRequest } from "@side-chat/ai-runtime-contract";
import { createAgentRuntime } from "#runtime/agent-runtime";
import {
  createOpenAIResponsesProvider,
  OPENAI_PROVIDER_ID,
  OPENAI_RESPONSES_URL,
} from "./openai-model-provider.js";

describe("createOpenAIResponsesProvider", () => {
  it("resolves an OpenAI Responses model for runtime execution", async () => {
    const calls: RequestInit[] = [];
    const runtime = createAgentRuntime({
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
    const body = calls[0]?.body;
    expect(typeof body).toBe("string");
    expect(JSON.parse(body as string)).toMatchObject({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "developer",
          content: expect.stringContaining("GitHub-flavored Markdown"),
        },
        { role: "user", content: [{ type: "input_text", text: "hello" }] },
      ],
      reasoning: {
        effort: "medium",
        summary: "auto",
      },
    });
  });

  it("turns provider HTTP failures into runtime errors without fallback", async () => {
    const runtime = createAgentRuntime({
      providers: [
        createOpenAIResponsesProvider({
          apiKey: "test-key",
          modelIds: ["gpt-5.4-mini"],
          fetch: (url) => {
            expect(url).toBe(OPENAI_RESPONSES_URL);
            return Promise.resolve(new Response("nope", { status: 503 }));
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

    await expect(
      collect(Stream.toAsyncIterable(runtime.streamEffect(request))),
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
    expect(() => createOpenAIResponsesProvider({ apiKey: "", modelIds: ["gpt-5.4-mini"] })).toThrow(
      "requires an API key",
    );
    expect(() => createOpenAIResponsesProvider({ apiKey: "test-key", modelIds: [] })).toThrow(
      "requires at least one allowed model",
    );
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
    allowedHostCommandNames: [],
  },
  ...overrides,
});
