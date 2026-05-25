import { describe, expect, it } from "vitest";
import { createMockWebSearchTool, MOCK_WEB_SEARCH_TOOL_NAME } from "#tools/mock-web-search";
import type { RuntimeRequest } from "../provider.js";
import { createRuntimeToolLookup, mapAiSdkToolActivity } from "./ai-sdk-runtime-tools.js";

describe("AI SDK runtime tool activity mapping", () => {
  it("maps model tool calls and results onto one stable activity row", () => {
    const runtimeTools = createRuntimeToolLookup([createMockWebSearchTool({ delayMs: 0 })]);
    const request = createRequest();
    const toolCall = mapAiSdkToolActivity(
      request,
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: MOCK_WEB_SEARCH_TOOL_NAME,
        dynamic: true,
        input: { query: "portfolio risk" },
      },
      3,
      runtimeTools,
    );
    const toolResult = mapAiSdkToolActivity(
      request,
      {
        type: "tool-result",
        toolCallId: "call_1",
        toolName: MOCK_WEB_SEARCH_TOOL_NAME,
        dynamic: true,
        input: { query: "portfolio risk" },
        output: {
          query: "portfolio risk",
          results: [{ title: "Risk Result", url: "https://example.test/risk" }],
          summary: "Found one result.",
        },
      },
      4,
      runtimeTools,
    );

    expect(toolCall).toMatchObject({
      type: "runtime.activity",
      activityId: "call_1",
      activityKind: "tool",
      status: "running",
      details: { tool: { input: { query: "portfolio risk" } } },
    });
    expect(toolResult).toMatchObject({
      type: "runtime.activity",
      activityId: "call_1",
      activityKind: "tool",
      status: "completed",
      details: {
        tool: {
          result: { summary: "Found one result." },
          sources: [{ label: "Risk Result", url: "https://example.test/risk" }],
        },
      },
    });
  });

  it("maps streamed tool input start before execution without inventing progress rows", () => {
    const event = mapAiSdkToolActivity(
      createRequest(),
      {
        type: "tool-input-start",
        id: "call_streaming",
        toolName: MOCK_WEB_SEARCH_TOOL_NAME,
      },
      2,
      createRuntimeToolLookup([]),
    );

    expect(event).toMatchObject({
      type: "runtime.activity",
      activityId: "call_streaming",
      activityKind: "tool",
      status: "running",
      title: `Run ${MOCK_WEB_SEARCH_TOOL_NAME}`,
    });
  });
});

const createRequest = (): RuntimeRequest => ({
  requestId: "req_001",
  assistantTurnId: "turn_001",
  modelId: "model",
  messages: [{ role: "user", content: "search web for portfolio risk" }],
});
