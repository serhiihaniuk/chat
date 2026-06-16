import { Stream } from "effect";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import type { AiRuntimeRequest } from "@side-chat/ai-runtime-contract";
import { describe, expect, it } from "vitest";
import {
  createFakeProvider,
  FAKE_ECHO_MODEL_ID,
  FAKE_PROVIDER_ID,
} from "#providers/fake/fake-model-provider";
import { createMockWebSearchTool, MOCK_WEB_SEARCH_TOOL_NAME } from "#testing/mock-runtime-tool";
import { collectEvents, createCapturingProvider } from "#testing/agent-runtime-test-support";
import { createAgentRuntime, DEFAULT_AGENT_EXECUTOR_ID } from "./agent-runtime.js";

describe("createAgentRuntime", () => {
  it("streams internal events by resolving a model provider through the runtime", async () => {
    const runtime = createAgentRuntime({
      providers: [createFakeProvider()],
    });
    const events = await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect(
          runtimeRequest({
            providerId: FAKE_PROVIDER_ID,
            modelId: FAKE_ECHO_MODEL_ID,
            requestId: "req_001",
            assistantTurnId: "turn_001",
            messages: [{ role: "user", content: "map me later" }],
          }),
        ),
      ),
    );

    expect(events[0]?.type).toBe("runtime.started");
    expect(events.at(-1)?.type).toBe("runtime.completed");
    expect(events.every((event) => event.requestId === "req_001")).toBe(true);
  });

  it("exposes an Effect stream as the first-class runtime surface", async () => {
    const runtime = createAgentRuntime({
      providers: [createFakeProvider()],
    });

    const events = await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect(
          runtimeRequest({
            providerId: FAKE_PROVIDER_ID,
            modelId: FAKE_ECHO_MODEL_ID,
            requestId: "req_effect",
            assistantTurnId: "turn_effect",
            messages: [{ role: "user", content: "effect stream" }],
          }),
        ),
      ),
    );

    expect(events[0]?.type).toBe("runtime.started");
    expect(events.at(-1)?.type).toBe("runtime.completed");
  });

  it("passes final messages unchanged before model execution", async () => {
    const modelCalls: LanguageModelV3CallOptions[] = [];
    const runtime = createAgentRuntime({
      providers: [createCapturingProvider(modelCalls)],
    });

    await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect(
          runtimeRequest({
            requestId: "req_final_messages",
            assistantTurnId: "turn_final_messages",
            messages: [
              { role: "system", content: "Use concise analyst language." },
              { role: "system", content: "Trusted context board:\n\nRisk budget is tight." },
              { role: "user", content: "respond in list" },
            ],
          }),
        ),
      ),
    );

    expect(modelCalls[0]?.prompt[0]).toMatchObject({
      role: "system",
      content: "Use concise analyst language.",
    });
    expect(modelCalls[0]?.prompt[1]).toMatchObject({
      role: "system",
      content: "Trusted context board:\n\nRisk budget is tight.",
    });
    expect(modelCalls[0]?.prompt[2]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "respond in list" }],
    });
  });

  it("selects app-owned tools without executing them before the model chooses them", async () => {
    const modelCalls: LanguageModelV3CallOptions[] = [];
    const tool = {
      ...createMockWebSearchTool(),
      execute: () => {
        throw new Error("The runtime must not execute tools before provider streaming.");
      },
    };
    const runtime = createAgentRuntime({
      providers: [createCapturingProvider(modelCalls)],
      tools: [tool],
    });

    const events = await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect(
          runtimeRequest({
            requestId: "req_003",
            assistantTurnId: "turn_003",
            messages: [{ role: "user", content: "search web for portfolio news" }],
            toolNames: [MOCK_WEB_SEARCH_TOOL_NAME],
          }),
        ),
      ),
    );

    expect(events[0]).toMatchObject({ type: "runtime.started" });
    expect(events.at(-1)).toMatchObject({ type: "runtime.completed" });
    expect(modelCalls[0]?.tools?.map((runtimeTool) => runtimeTool.name)).toEqual([
      MOCK_WEB_SEARCH_TOOL_NAME,
    ]);
  });

  it("passes only per-turn requested tools from a larger executable registry", async () => {
    const modelCalls: LanguageModelV3CallOptions[] = [];
    const runtime = createAgentRuntime({
      providers: [createCapturingProvider(modelCalls)],
      tools: [
        createMockWebSearchTool(),
        {
          ...createMockWebSearchTool(),
          name: "admin_lookup",
          description: "Look up privileged admin data.",
        },
      ],
    });

    await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect(
          runtimeRequest({
            requestId: "req_larger_registry",
            assistantTurnId: "turn_larger_registry",
            messages: [{ role: "user", content: "search public sources" }],
            toolNames: [MOCK_WEB_SEARCH_TOOL_NAME],
          }),
        ),
      ),
    );

    expect(modelCalls[0]?.tools?.map((runtimeTool) => runtimeTool.name)).toEqual([
      MOCK_WEB_SEARCH_TOOL_NAME,
    ]);
  });

  it("exposes no tools when a turn requests none", async () => {
    const modelCalls: LanguageModelV3CallOptions[] = [];
    const runtime = createAgentRuntime({
      providers: [createCapturingProvider(modelCalls)],
      tools: [createMockWebSearchTool()],
    });

    await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect(
          runtimeRequest({
            requestId: "req_no_tools",
            assistantTurnId: "turn_no_tools",
            messages: [{ role: "user", content: "Can you search?" }],
            toolNames: [],
          }),
        ),
      ),
    );

    expect(modelCalls[0]?.tools).toBeUndefined();
  });
});

const runtimeRequest = (overrides: Partial<AiRuntimeRequest> = {}): AiRuntimeRequest => ({
  requestId: "req_default",
  assistantTurnId: "turn_default",
  executorId: DEFAULT_AGENT_EXECUTOR_ID,
  providerId: "capture",
  modelId: "capture-model",
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
