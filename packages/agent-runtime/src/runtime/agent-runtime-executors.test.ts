import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { Stream } from "effect";
import {
  RUNTIME_ERROR_CODES,
  RUNTIME_EVENT_TYPES,
  type AiRuntimeRequest,
} from "@side-chat/ai-runtime-contract";
import { describe, expect, it } from "vitest";
import { createFakeProvider } from "#providers/fake/fake-model-provider";
import {
  collectEvents,
  createCapturingProvider,
  createDeterministicExecutor,
  createThrowingProvider,
} from "#testing/agent-runtime-test-support";
import {
  createAgentRuntime,
  DEFAULT_AGENT_EXECUTOR_ID,
  type AgentExecutionRequest,
} from "./agent-runtime.js";

describe("createAgentRuntime executor selection", () => {
  it("selects a requested executor without entering the AI SDK stream runner", async () => {
    const modelCalls: LanguageModelV3CallOptions[] = [];
    const executionRequests: AgentExecutionRequest[] = [];
    const runtime = createAgentRuntime({
      providers: [createCapturingProvider(modelCalls)],
      executors: [createDeterministicExecutor("deterministic.test", executionRequests)],
    });

    const events = await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect({
          ...runtimeRequest(),
          executorId: "deterministic.test",
          requestId: "req_executor",
          assistantTurnId: "turn_executor",
          messages: [{ role: "user", content: "executor seam" }],
        }),
      ),
    );

    expect(events.map((event) => event.type)).toEqual([
      RUNTIME_EVENT_TYPES.STARTED,
      RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
      RUNTIME_EVENT_TYPES.COMPLETED,
    ]);
    expect(events[1]).toMatchObject({ content: "executor:deterministic.test" });
    expect(executionRequests[0]?.providerRequest).toMatchObject({
      requestId: "req_executor",
      assistantTurnId: "turn_executor",
      providerId: "capture",
      modelId: "capture-model",
    });
    expect(modelCalls).toHaveLength(0);
  });

  it("rejects unknown executors before resolving provider adapters", async () => {
    const runtime = createAgentRuntime({
      providers: [createThrowingProvider()],
    });

    await expect(
      collectEvents(
        Stream.toAsyncIterable(
          runtime.streamEffect({
            ...runtimeRequest(),
            executorId: "missing_executor",
            providerId: "throwing",
            modelId: "throwing-model",
            requestId: "req_missing_executor",
            assistantTurnId: "turn_missing_executor",
            messages: [],
          }),
        ),
      ),
    ).rejects.toMatchObject({
      code: RUNTIME_ERROR_CODES.EXECUTOR_UNAVAILABLE,
      message: "executor missing_executor is not registered",
    });
  });

  it("rejects duplicate executor ids during composition", () => {
    expect(() =>
      createAgentRuntime({
        providers: [createFakeProvider()],
        executors: [createDeterministicExecutor(DEFAULT_AGENT_EXECUTOR_ID)],
      }),
    ).toThrow(`duplicate executor ${DEFAULT_AGENT_EXECUTOR_ID}`);
  });
});

const runtimeRequest = (): AiRuntimeRequest => ({
  executorId: DEFAULT_AGENT_EXECUTOR_ID,
  providerId: "capture",
  modelId: "capture-model",
  requestId: "req_default",
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
});
