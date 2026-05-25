import { describe, expect, it } from "vitest";
import { ProtocolValidationError } from "../errors.js";
import { parseSidechatStreamEvent } from "../validation.js";
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

  it("accepts tool input and result payloads", () => {
    const event = parseSidechatStreamEvent({
      protocolVersion: "sidechat.v1",
      type: SIDECHAT_EVENT_TYPES.TOOL,
      eventId: "evt_002",
      assistantTurnId: "turn_001",
      sequence: 2,
      createdAt: "2026-05-23T13:00:00.000Z",
      toolCallId: "tool_001",
      toolName: "mock_web_search",
      status: "completed",
      input: { query: "latest news" },
      result: { summary: "mocked result" },
    });

    expect(event).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.TOOL,
      input: { query: "latest news" },
      result: { summary: "mocked result" },
    });
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
});
