import { Effect, Stream } from "effect";
import {
  AiRuntimeError,
  RUNTIME_ERROR_CODES,
  isRuntimeTerminalEvent,
  type AiRuntimeRequest,
  type RuntimeEvent,
} from "@side-chat/ai-runtime-contract";
import type { ModelProvider } from "#providers/model-provider";
import {
  createFakeProvider,
  FAKE_ECHO_MODEL_ID,
  FAKE_PROVIDER_ID,
} from "#providers/fake/fake-model-provider";
import { createMockWebSearchTool, MOCK_WEB_SEARCH_TOOL_NAME } from "#testing/mock-runtime-tool";
import { collectEvents, createErrorThenFinishProvider } from "#testing/agent-runtime-test-support";
import { createScriptedLanguageModel } from "#testing/scripted-language-model";
import { describe, expect, it } from "vitest";
import { createAgentRuntime, DEFAULT_AGENT_EXECUTOR_ID } from "./agent-runtime.js";

const createDelayedProvider = (): ModelProvider => ({
  providerId: "delayed",
  modelIds: ["delayed-model"],
  resolveModel: (selection) =>
    Effect.succeed(
      createScriptedLanguageModel({
        providerId: "delayed",
        modelId: selection.modelId,
        text: "one two three four five six",
        streamDelayMs: 25,
      }),
    ),
});

describe("runtime terminal semantics", () => {
  it("ends an aborted turn with exactly one aborted completion terminal", async () => {
    const controller = new AbortController();
    // Disable batching so each word is its own delta and the first one arrives
    // well before the run finishes, leaving the model mid-stream when we abort.
    const runtime = createAgentRuntime({
      flushIntervalMs: 0,
      providers: [createDelayedProvider()],
    });

    const events: RuntimeEvent[] = [];
    for await (const event of Stream.toAsyncIterable(
      runtime.streamEffect(
        request({
          providerId: "delayed",
          modelId: "delayed-model",
          abortSignal: controller.signal,
        }),
      ),
    )) {
      events.push(event);
      if (event.type === "runtime.output_delta") controller.abort();
    }

    const terminals = events.filter(isRuntimeTerminalEvent);
    expect(terminals).toHaveLength(1);
    expect(terminals[0]).toMatchObject({ type: "runtime.completed", finishReason: "aborted" });
  });

  it("keeps a single terminal when an error is followed by an errored finish", async () => {
    const runtime = createAgentRuntime({
      flushIntervalMs: 0,
      providers: [createErrorThenFinishProvider()],
    });

    const events = await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect(
          request({ providerId: "error-finish", modelId: "error-finish-model" }),
        ),
      ),
    );

    const terminals = events.filter(isRuntimeTerminalEvent);
    expect(terminals).toHaveLength(1);
    expect(terminals[0]?.type).toBe("runtime.error");
    // The errored finish must never surface as a second, contradicting completion.
    expect(events.some((event) => event.type === "runtime.completed")).toBe(false);
  });

  it("rejects a turn where a host command and a runtime tool share a name", async () => {
    const runtime = createAgentRuntime({
      flushIntervalMs: 0,
      providers: [createFakeProvider()],
      tools: [createMockWebSearchTool()],
    });

    const stream = runtime.streamEffect(
      request({
        providerId: FAKE_PROVIDER_ID,
        modelId: FAKE_ECHO_MODEL_ID,
        toolNames: [MOCK_WEB_SEARCH_TOOL_NAME],
        toolScope: {
          hostAppId: "host_app_001",
          workspaceId: "workspace_001",
          subjectId: "subject_001",
          conversationId: "conversation_001",
          assistantTurnId: "turn_conflict",
          hostCommands: [
            {
              // Same name as the registered runtime tool — a configuration error.
              commandName: MOCK_WEB_SEARCH_TOOL_NAME,
              description: "A host command colliding with a runtime tool.",
              inputSchema: { type: "object" },
            },
          ],
        },
      }),
    );

    // `flip` swaps channels: a stream failure resolves with the error, so a
    // (wrong) success would reject the promise and fail the test instead.
    const error = await Effect.runPromise(Effect.flip(Stream.runCollect(stream)));

    expect(error).toBeInstanceOf(AiRuntimeError);
    expect(error.code).toBe(RUNTIME_ERROR_CODES.TOOL_CONFLICT);
  });
});

const request = (overrides: Partial<AiRuntimeRequest> = {}): AiRuntimeRequest => ({
  requestId: "req_terminal",
  assistantTurnId: "turn_terminal",
  executorId: DEFAULT_AGENT_EXECUTOR_ID,
  providerId: "delayed",
  modelId: "delayed-model",
  messages: [{ role: "user", content: "generate something" }],
  toolNames: [],
  toolScope: {
    hostAppId: "host_app_001",
    workspaceId: "workspace_001",
    subjectId: "subject_001",
    conversationId: "conversation_001",
    assistantTurnId: "turn_terminal",
  },
  ...overrides,
});
