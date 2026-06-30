import { Stream } from "effect";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { createMockWebSearchTool } from "#testing/mock-runtime-tool";
import { collectEvents, createCapturingProvider } from "#testing/agent-runtime-test-support";
import { createAgentRuntime, DEFAULT_AGENT_EXECUTOR_ID } from "../agent-runtime.js";
import { createBasicRuntimeAgent } from "./basic-runtime-agent.js";

describe("createBasicRuntimeAgent", () => {
  it("streams a model-only job with caller-owned instructions and no tools", async () => {
    const modelCalls: LanguageModelV3CallOptions[] = [];
    const runtime = createAgentRuntime({
      providers: [createCapturingProvider(modelCalls)],
      tools: [createMockWebSearchTool()],
    });
    const agent = createBasicRuntimeAgent(runtime, {
      executorId: DEFAULT_AGENT_EXECUTOR_ID,
      providerId: "capture",
      modelId: "capture-model",
      toolScope: basicToolScope,
      systemInstructions: "Classify the exchange without using tools.",
    });

    const events = await collectEvents(
      Stream.toAsyncIterable(
        agent.streamEffect({
          requestId: "req_basic_agent",
          assistantTurnId: "turn_basic_agent",
          messages: [{ role: "user", content: "Hello service." }],
        }),
      ),
    );

    expect(events[0]).toMatchObject({ type: "runtime.started" });
    expect(events.at(-1)).toMatchObject({ type: "runtime.completed" });
    expect(modelCalls[0]?.prompt[0]).toMatchObject({
      role: "system",
      content: "Classify the exchange without using tools.",
    });
    expect(modelCalls[0]?.tools).toBeUndefined();
  });

  it("lets each job override default system instructions", async () => {
    const modelCalls: LanguageModelV3CallOptions[] = [];
    const runtime = createAgentRuntime({
      providers: [createCapturingProvider(modelCalls)],
    });
    const agent = createBasicRuntimeAgent(runtime, {
      executorId: DEFAULT_AGENT_EXECUTOR_ID,
      providerId: "capture",
      modelId: "capture-model",
      toolScope: basicToolScope,
      systemInstructions: "Default job instructions.",
    });

    await collectEvents(
      Stream.toAsyncIterable(
        agent.streamEffect({
          requestId: "req_basic_agent_override",
          assistantTurnId: "turn_basic_agent_override",
          systemInstructions: "Override for this specific job.",
          messages: [{ role: "user", content: "Check this." }],
        }),
      ),
    );

    expect(modelCalls[0]?.prompt[0]).toMatchObject({
      role: "system",
      content: "Override for this specific job.",
    });
  });
});

const basicToolScope = {
  hostAppId: "host_app_001",
  workspaceId: "workspace_001",
  subjectId: "subject_001",
  conversationId: "conversation_001",
  assistantTurnId: "turn_basic_agent",
} as const;
