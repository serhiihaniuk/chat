import {
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  decodeSseEvents,
} from "@side-chat/chat-protocol";
import {
  RUNTIME_FINISH_REASONS,
  RUNTIME_EVENT_TYPES,
  type RuntimeEvent,
} from "@side-chat/agent-runtime";
import { Stream } from "effect";
import { describe, expect, it } from "vitest";
import { createPartnerAiServiceApp } from "./app.js";

const validRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_001",
  message: { id: "message_001", content: "hello service" },
  hostContext: {
    schemaVersion: "host.v1",
    origin: "https://host.example",
  },
};

describe("partner ai service tool activity stream", () => {
  it("maps service runtime tool activity into ordered protocol activity rows", async () => {
    const runtimeEvents = createToolRuntimeEvents("request_001", "assistant_turn_001");
    const runtimeRequests: unknown[] = [];
    const response = await createPartnerAiServiceApp({
      agentRuntime: {
        streamEffect: (request) => {
          runtimeRequests.push(request);
          return Stream.fromIterable(runtimeEvents);
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
    expect(visibleRuntimeRequests(runtimeRequests)[0]).toMatchObject({
      messages: [{ role: "user", content: "hello service" }],
    });
    expect(events.filter((event) => event.type === SIDECHAT_EVENT_TYPES.ACTIVITY)).toEqual([
      expect.objectContaining({
        type: SIDECHAT_EVENT_TYPES.ACTIVITY,
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
        type: SIDECHAT_EVENT_TYPES.ACTIVITY,
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
    expect(events.at(-1)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.COMPLETED });
  });
});

const createToolRuntimeEvents = (
  requestId: string,
  assistantTurnId: string,
): readonly RuntimeEvent[] => [
  {
    type: RUNTIME_EVENT_TYPES.ACTIVITY,
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
    type: RUNTIME_EVENT_TYPES.ACTIVITY,
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
    type: RUNTIME_EVENT_TYPES.COMPLETED,
    requestId,
    assistantTurnId,
    sequence: 2,
    finishReason: RUNTIME_FINISH_REASONS.STOP,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  },
];

const visibleRuntimeRequests = (requests: readonly unknown[]): readonly unknown[] =>
  requests.filter(
    (request): request is { readonly requestId: string } =>
      typeof request === "object" &&
      request !== null &&
      "requestId" in request &&
      typeof request.requestId === "string" &&
      !request.requestId.endsWith(":title"),
  );
