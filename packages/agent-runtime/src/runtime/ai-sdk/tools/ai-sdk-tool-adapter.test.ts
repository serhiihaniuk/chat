import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createMockWebSearchTool, MOCK_WEB_SEARCH_TOOL_NAME } from "#testing/mock-runtime-tool";
import type { RuntimeProviderRequest } from "../../contract/runtime-request.js";
import type { RuntimeTool } from "#tools/runtime-tool";
import { createAiSdkToolSet } from "./ai-sdk-tool-adapter.js";
import {
  createRuntimeToolLookup,
  mapAiSdkToolActivity,
} from "../streaming/tool-activity-mapper.js";

describe("createAiSdkToolSet", () => {
  it("executes injected runtime tools through Effect with request context", async () => {
    const runtimeTool: RuntimeTool = {
      name: "context_echo",
      description: "Echoes the runtime context available to a tool.",
      inputSchema: { type: "object", additionalProperties: true },
      execute: (input, context) =>
        Effect.succeed({
          input,
          requestId: context.requestId,
          assistantTurnId: context.assistantTurnId,
          toolName: context.toolName,
        }),
    };

    const toolSet = createAiSdkToolSet([runtimeTool], createRequest());
    const aiSdkTool = toolSet?.["context_echo"];

    await expect(
      aiSdkTool?.execute?.({ query: "portfolio risk" }, { toolCallId: "call_1", messages: [] }),
    ).resolves.toEqual({
      input: { query: "portfolio risk" },
      requestId: "req_001",
      assistantTurnId: "turn_001",
      toolName: "context_echo",
    });
  });

  it("enforces declared runtime tool timeouts before returning to AI SDK", async () => {
    const runtimeTool: RuntimeTool = {
      name: "slow_tool",
      description: "Never returns before the runtime timeout.",
      inputSchema: { type: "object", additionalProperties: true },
      timeoutMs: 1,
      execute: () => Effect.never,
    };

    const toolSet = createAiSdkToolSet([runtimeTool], createRequest());
    const aiSdkTool = toolSet?.["slow_tool"];

    await expect(
      aiSdkTool?.execute?.({}, { toolCallId: "call_timeout", messages: [] }),
    ).rejects.toMatchObject({
      code: "timeout",
      message: "slow_tool timed out after 1ms.",
    });
  });
});

describe("AI SDK runtime tool activity mapping", () => {
  it("maps model tool calls and results onto one stable activity row", () => {
    const runtimeTools = createRuntimeToolLookup([createMockWebSearchTool()]);
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

  it("maps AI SDK tool errors to failed normalized runtime activity", () => {
    const event = mapAiSdkToolActivity(
      createRequest(),
      {
        type: "tool-error",
        toolCallId: "call_failed",
        toolName: MOCK_WEB_SEARCH_TOOL_NAME,
        dynamic: true,
        input: { query: "portfolio risk" },
        error: new Error("tool failed"),
      },
      5,
      createRuntimeToolLookup([createMockWebSearchTool()]),
    );

    expect(event).toMatchObject({
      type: "runtime.activity",
      activityId: "call_failed",
      activityKind: "tool",
      status: "failed",
      details: {
        tool: {
          errorCode: "tool_failed",
          input: { query: "portfolio risk" },
        },
      },
    });
  });
});

const createRequest = (): RuntimeProviderRequest => ({
  requestId: "req_001",
  assistantTurnId: "turn_001",
  providerId: "provider",
  modelId: "model",
  messages: [{ role: "user", content: "search web for portfolio risk" }],
});
