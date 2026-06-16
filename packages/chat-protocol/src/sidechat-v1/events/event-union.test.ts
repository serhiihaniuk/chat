import { describe, expect, it } from "vitest";
import { ProtocolValidationError } from "../errors.js";
import { parseSidechatStreamEvent } from "../validation/validation.js";
import { SIDECHAT_EVENT_TYPES } from "./event-union.js";

describe("sidechat event validation", () => {
  it("accepts product-owned protocol events", () => {
    const event = parseSidechatStreamEvent({
      protocolVersion: "sidechat.v1",
      type: SIDECHAT_EVENT_TYPES.DELTA,
      eventId: "evt_001",
      assistantTurnId: "turn_001",
      sequence: 1,
      createdAt: "2026-05-23T13:00:00.000Z",
      content: "hello",
    });

    expect(event.type).toBe(SIDECHAT_EVENT_TYPES.DELTA);
  });

  it("accepts canonical activity payloads with tool details", () => {
    const event = parseSidechatStreamEvent({
      protocolVersion: "sidechat.v1",
      type: SIDECHAT_EVENT_TYPES.ACTIVITY,
      eventId: "evt_002",
      assistantTurnId: "turn_001",
      sequence: 2,
      createdAt: "2026-05-23T13:00:00.000Z",
      activityId: "tool_001",
      activityKind: "tool",
      status: "completed",
      title: "Run mock_web_search",
      details: {
        tool: {
          toolCallId: "tool_001",
          toolName: "mock_web_search",
          input: { query: "latest news" },
          result: { summary: "mocked result" },
        },
      },
    });

    expect(event).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.ACTIVITY,
      activityKind: "tool",
      details: {
        tool: {
          input: { query: "latest news" },
          result: { summary: "mocked result" },
        },
      },
    });
  });

  it("rejects malformed nested activity details", () => {
    const baseActivity = {
      protocolVersion: "sidechat.v1",
      type: SIDECHAT_EVENT_TYPES.ACTIVITY,
      eventId: "evt_bad_activity",
      assistantTurnId: "turn_001",
      sequence: 3,
      createdAt: "2026-05-23T13:00:00.000Z",
      activityId: "tool_001",
      activityKind: "tool",
      status: "completed",
      title: "Run mock_web_search",
    };

    for (const details of [
      { tool: { toolName: "mock_web_search" } },
      { tool: { toolCallId: "tool_001", toolName: "mock_web_search", result: "raw" } },
      { tool: { toolCallId: "tool_001", toolName: "mock_web_search", providerPart: {} } },
      { sources: [{ url: "https://example.test/result" }] },
      { images: [{ alt: "chart", mediaType: "image/png" }] },
      { hostCommand: { commandId: "cmd_001", commandName: "open_resource" } },
    ]) {
      expect(() => parseSidechatStreamEvent({ ...baseActivity, details })).toThrow(
        ProtocolValidationError,
      );
    }
  });

  it("rejects malformed history message sequences", () => {
    const historyEvent = {
      protocolVersion: "sidechat.v1",
      type: SIDECHAT_EVENT_TYPES.HISTORY,
      eventId: "evt_history",
      assistantTurnId: "turn_001",
      sequence: 4,
      createdAt: "2026-05-23T13:00:00.000Z",
      messages: [
        {
          id: "message_001",
          role: "user",
          content: "hello",
          sequence: 1,
        },
      ],
    };

    for (const sequence of [-1, 1.5]) {
      expect(() =>
        parseSidechatStreamEvent({
          ...historyEvent,
          messages: [{ ...historyEvent.messages[0], sequence }],
        }),
      ).toThrow(ProtocolValidationError);
    }
  });

  it("rejects event fields outside the declared event shape", () => {
    expect(() =>
      parseSidechatStreamEvent({
        protocolVersion: "sidechat.v1",
        type: SIDECHAT_EVENT_TYPES.DELTA,
        eventId: "evt_extra",
        assistantTurnId: "turn_001",
        sequence: 4,
        createdAt: "2026-05-23T13:00:00.000Z",
        content: "hello",
        content_text: "raw row text",
      }),
    ).toThrow(ProtocolValidationError);
  });

  it("rejects provider-native and AI SDK UI stream shapes", () => {
    for (const providerShape of [
      { type: "text-delta", textDelta: "hello" },
      { type: "tool-call", toolCallId: "call_1" },
      { role: "assistant", parts: [{ type: "text", text: "hello" }] },
    ]) {
      expect(() => parseSidechatStreamEvent(providerShape)).toThrow(ProtocolValidationError);
    }
  });

  it("rejects recognizable DB-row and HTTP framework shapes", () => {
    for (const leakedShape of [
      {
        protocolVersion: "sidechat.v1",
        type: SIDECHAT_EVENT_TYPES.DELTA,
        eventId: "evt_db_row",
        assistantTurnId: "turn_001",
        sequence: 4,
        createdAt: "2026-05-23T13:00:00.000Z",
        content: "safe text",
        content_text: "raw row text",
      },
      {
        req: { path: "/chat/stream" },
        res: {},
        json: () => undefined,
      },
    ]) {
      expect(() => parseSidechatStreamEvent(leakedShape)).toThrow(ProtocolValidationError);
    }
  });
});
