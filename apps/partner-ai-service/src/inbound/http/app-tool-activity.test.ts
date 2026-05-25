import { decodeSseEvents, SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import type { RuntimeEvent } from "@side-chat/agent-runtime";
import { describe, expect, it } from "vitest";
import { createPartnerAiServiceApp } from "./app.js";

const validRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_001",
  message: { id: "message_001", role: "user" as const, content: "hello service" },
  hostContext: {
    schemaVersion: "host.v1",
    origin: "https://host.example",
  },
};

describe("partner ai service tool activity stream", () => {
  it("maps service runtime tool activity into ordered protocol activity rows", async () => {
    const runtimeEvents = createToolRuntimeEvents("request_001", "assistant_turn_001");
    const response = await createPartnerAiServiceApp({
      agentRuntime: {
        stream: async function* (request) {
          expect(request.messages).toEqual([validRequest.message]);
          for (const event of runtimeEvents) yield event;
        },
      },
    }).request("/chat/stream", {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(validRequest),
    });

    expect(response.status).toBe(200);
    const events = decodeSseEvents(await response.text());
    expect(events.filter((event) => event.type === "sidechat.activity")).toEqual([
      expect.objectContaining({
        type: "sidechat.activity",
        sequence: 1,
        activityId: "call_001",
        activityKind: "tool",
        status: "running",
        details: {
          tool: {
            toolCallId: "call_001",
            toolName: "mock_web_search",
            input: { query: "portfolio risk" },
          },
        },
      }),
      expect.objectContaining({
        type: "sidechat.activity",
        sequence: 2,
        activityId: "call_001",
        activityKind: "tool",
        status: "completed",
        details: {
          tool: {
            toolCallId: "call_001",
            toolName: "mock_web_search",
            input: { query: "portfolio risk" },
            result: { summary: "found context" },
            sources: [{ label: "Example", url: "https://example.test/result" }],
          },
        },
      }),
    ]);
    expect(events.at(-1)).toMatchObject({ type: "sidechat.completed" });
  });
});

const createToolRuntimeEvents = (
  requestId: string,
  assistantTurnId: string,
): readonly RuntimeEvent[] => [
  {
    type: "runtime.activity",
    requestId,
    assistantTurnId,
    sequence: 0,
    activityId: "call_001",
    activityKind: "tool",
    status: "running",
    title: "Run mock_web_search",
    details: {
      tool: {
        toolCallId: "call_001",
        toolName: "mock_web_search",
        input: { query: "portfolio risk" },
      },
    },
  },
  {
    type: "runtime.activity",
    requestId,
    assistantTurnId,
    sequence: 1,
    activityId: "call_001",
    activityKind: "tool",
    status: "completed",
    title: "Run mock_web_search",
    details: {
      tool: {
        toolCallId: "call_001",
        toolName: "mock_web_search",
        input: { query: "portfolio risk" },
        result: { summary: "found context" },
        sources: [{ label: "Example", url: "https://example.test/result" }],
      },
    },
  },
  {
    type: "runtime.completed",
    requestId,
    assistantTurnId,
    sequence: 2,
    finishReason: "stop",
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  },
];
