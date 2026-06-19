import { describe, expect, it } from "vitest";
import { Stream } from "effect";
import { isRuntimeTerminalEvent, type AiRuntimeRequest } from "@side-chat/ai-runtime-contract";
import { createAgentRuntime } from "#runtime/agent-runtime";
import { createMockWebSearchTool, MOCK_WEB_SEARCH_TOOL_NAME } from "#testing/mock-runtime-tool";
import { createFakeProvider, FAKE_ECHO_MODEL_ID, FAKE_PROVIDER_ID } from "./fake-model-provider.js";

describe("createFakeProvider", () => {
  it("resolves a deterministic fake model for the runtime orchestrator", async () => {
    const runtime = createAgentRuntime({
      providers: [createFastFakeProvider()],
    });
    const request = runtimeRequest({
      requestId: "req_001",
      assistantTurnId: "turn_001",
      providerId: FAKE_PROVIDER_ID,
      modelId: FAKE_ECHO_MODEL_ID,
      messages: [{ role: "user", content: "hello runtime" }],
    });
    const events = await collectEvents(Stream.toAsyncIterable(runtime.streamEffect(request)));

    expect(events[0]?.type).toBe("runtime.started");
    expect(events[1]).toMatchObject({
      type: "runtime.activity",
      activityKind: "reasoning",
      title: "Thinking (medium)",
    });
    expect(events.filter((event) => event.type === "runtime.activity")).toHaveLength(2);
    expect(
      events
        .filter((event) => event.type === "runtime.output_delta")
        .map((event) => event.content)
        .join(""),
    ).toBe("Fake response: hello runtime");
    expect(events[0]).toMatchObject({
      providerId: FAKE_PROVIDER_ID,
      modelId: FAKE_ECHO_MODEL_ID,
      sequence: 0,
    });
    expect(events.at(-1)).toMatchObject({
      type: "runtime.completed",
    });
  });

  it("emits exactly one terminal event", async () => {
    const runtime = createAgentRuntime({
      providers: [createFastFakeProvider()],
    });
    const request = runtimeRequest({
      requestId: "req_002",
      assistantTurnId: "turn_002",
      providerId: FAKE_PROVIDER_ID,
      modelId: FAKE_ECHO_MODEL_ID,
      messages: [],
    });
    const events = await collectEvents(Stream.toAsyncIterable(runtime.streamEffect(request)));

    expect(events.filter(isRuntimeTerminalEvent)).toHaveLength(1);
  });

  it("varies demo reasoning activity by selected effort", async () => {
    const runtime = createAgentRuntime({
      providers: [createFastFakeProvider()],
    });
    const request = runtimeRequest({
      requestId: "req_reasoning",
      assistantTurnId: "turn_reasoning",
      providerId: FAKE_PROVIDER_ID,
      modelId: FAKE_ECHO_MODEL_ID,
      reasoning: { effort: "high" },
      messages: [{ role: "user", content: "show thinking levels" }],
    });
    const events = await collectEvents(Stream.toAsyncIterable(runtime.streamEffect(request)));

    expect(events[1]).toMatchObject({
      type: "runtime.activity",
      activityKind: "reasoning",
      title: "Thinking (high)",
      body: expect.stringContaining("deterministic demo behavior"),
    });
    expect(
      events
        .filter((event) => event.type === "runtime.output_delta")
        .map((event) => event.content)
        .join(""),
    ).toContain("using **high** thinking");
  });

  it("streams a markdown showcase for simple demo prompts", async () => {
    const runtime = createAgentRuntime({
      providers: [createFastFakeProvider()],
    });
    const request = runtimeRequest({
      requestId: "req_markdown",
      assistantTurnId: "turn_markdown",
      providerId: FAKE_PROVIDER_ID,
      modelId: FAKE_ECHO_MODEL_ID,
      messages: [{ role: "user", content: "hello" }],
    });
    const events = await collectEvents(Stream.toAsyncIterable(runtime.streamEffect(request)));

    const output = outputText(events);
    expect(output).toContain("## Showcase Response");
    expect(output).toContain("| Feature | What to point at |");
    expect(output).toContain("```ts");
  });

  it("uses the exposed mock search tool before the markdown final answer", async () => {
    const runtime = createAgentRuntime({
      providers: [createFastFakeProvider()],
      tools: [createMockWebSearchTool()],
    });
    const request = runtimeRequest({
      requestId: "req_tool",
      assistantTurnId: "turn_tool",
      providerId: FAKE_PROVIDER_ID,
      modelId: FAKE_ECHO_MODEL_ID,
      messages: [{ role: "user", content: "tool" }],
      toolNames: [MOCK_WEB_SEARCH_TOOL_NAME],
    });
    const events = await collectEvents(Stream.toAsyncIterable(runtime.streamEffect(request)));

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "runtime.activity",
        activityKind: "tool",
        status: "completed",
        details: expect.objectContaining({
          tool: expect.objectContaining({
            toolName: MOCK_WEB_SEARCH_TOOL_NAME,
            result: expect.objectContaining({
              summary: expect.stringContaining("Mocked web search found"),
            }),
          }),
        }),
      }),
    );
    expect(outputText(events)).toContain("## Tool-Backed Showcase");
    expect(outputText(events)).toContain("Mocked web search found");
  });

  it("answers the deterministic codename follow-up from prior runtime messages", async () => {
    const runtime = createAgentRuntime({
      providers: [createFastFakeProvider()],
    });
    const request = runtimeRequest({
      requestId: "req_codename",
      assistantTurnId: "turn_codename",
      providerId: FAKE_PROVIDER_ID,
      modelId: FAKE_ECHO_MODEL_ID,
      messages: [
        { role: "user", content: "My project codename is Blue Lynx." },
        { role: "assistant", content: "I will remember Blue Lynx." },
        { role: "user", content: "What is my project codename?" },
      ],
    });
    const events = await collectEvents(Stream.toAsyncIterable(runtime.streamEffect(request)));

    expect(
      events
        .filter((event) => event.type === "runtime.output_delta")
        .map((event) => event.content)
        .join(""),
    ).toBe("Your project codename is Blue Lynx.");
  });
});

const createFastFakeProvider = () => createFakeProvider({ streamDelayMs: 0 });

const collectEvents = async <T>(events: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};

const outputText = (
  events: readonly { readonly type: string; readonly content?: string }[],
): string =>
  events
    .filter((event) => event.type === "runtime.output_delta")
    .map((event) => event.content ?? "")
    .join("");

const runtimeRequest = (overrides: Partial<AiRuntimeRequest>): AiRuntimeRequest => ({
  executorId: "ai_sdk.tool_loop",
  providerId: FAKE_PROVIDER_ID,
  modelId: FAKE_ECHO_MODEL_ID,
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
  ...overrides,
});
