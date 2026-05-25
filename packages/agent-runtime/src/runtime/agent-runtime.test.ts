import { describe, expect, it } from "vitest";
import { AgentRuntimeError } from "../errors.js";
import { createFakeProvider, FAKE_ECHO_MODEL_ID, FAKE_PROVIDER_ID } from "#fake/fake-provider";
import { createMockWebSearchTool, MOCK_WEB_SEARCH_TOOL_NAME } from "#tools/mock-web-search";
import { createAgentRuntime } from "./agent-runtime.js";

describe("createAgentRuntime", () => {
  it("streams internal events from the selected provider", async () => {
    const runtime = createAgentRuntime({
      providers: [createFakeProvider()],
    });
    const events = await collectEvents(
      runtime.stream({
        providerId: FAKE_PROVIDER_ID,
        modelId: FAKE_ECHO_MODEL_ID,
        requestId: "req_001",
        assistantTurnId: "turn_001",
        messages: [{ role: "user", content: "map me later" }],
      }),
    );

    expect(events[0]?.type).toBe("runtime.started");
    expect(events.at(-1)?.type).toBe("runtime.completed");
    expect(events.every((event) => event.requestId === "req_001")).toBe(true);
  });

  it("checks requested tools before model execution", () => {
    const runtime = createAgentRuntime({
      providers: [createFakeProvider()],
    });

    expect(() =>
      runtime.stream({
        providerId: FAKE_PROVIDER_ID,
        modelId: FAKE_ECHO_MODEL_ID,
        requestId: "req_002",
        assistantTurnId: "turn_002",
        messages: [],
        toolNames: ["missing"],
      }),
    ).toThrow(AgentRuntimeError);
  });

  it("streams auto-invoked backend tool calls and adds their output to provider context", async () => {
    const providerMessages: unknown[] = [];
    const runtime = createAgentRuntime({
      providers: [
        {
          providerId: FAKE_PROVIDER_ID,
          modelIds: [FAKE_ECHO_MODEL_ID],
          async *stream(request) {
            providerMessages.push(...request.messages);
            yield {
              type: "runtime.started",
              requestId: request.requestId,
              assistantTurnId: request.assistantTurnId,
              sequence: 0,
              providerId: FAKE_PROVIDER_ID,
              modelId: FAKE_ECHO_MODEL_ID,
            };
            yield {
              type: "runtime.completed",
              requestId: request.requestId,
              assistantTurnId: request.assistantTurnId,
              sequence: 1,
              finishReason: "stop",
            };
          },
        },
      ],
      tools: [createMockWebSearchTool({ delayMs: 0 })],
    });

    const events = await collectEvents(
      runtime.stream({
        providerId: FAKE_PROVIDER_ID,
        modelId: FAKE_ECHO_MODEL_ID,
        requestId: "req_003",
        assistantTurnId: "turn_003",
        messages: [{ role: "user", content: "search web for portfolio news" }],
      }),
    );

    expect(events).toMatchObject([
      { type: "runtime.reasoning", summary: expect.stringContaining("Searching the web") },
      { type: "runtime.reasoning", summary: expect.stringContaining("Scanning mocked") },
      {
        type: "runtime.tool_call",
        toolName: MOCK_WEB_SEARCH_TOOL_NAME,
        argumentsJson: { query: "search web for portfolio news" },
      },
      {
        type: "runtime.tool_result",
        toolName: MOCK_WEB_SEARCH_TOOL_NAME,
        status: "completed",
      },
      { type: "runtime.started" },
      { type: "runtime.completed" },
    ]);
    expect(providerMessages).toContainEqual(
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("Backend tool mock_web_search returned"),
      }),
    );
  });
});

const collectEvents = async <T>(events: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};
