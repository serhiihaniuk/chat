import { describe, expect, it } from "vitest";
import { ProtocolSequenceError } from "../errors.js";
import { SIDECHAT_EVENT_TYPES, type SidechatStreamEvent } from "../events/event-union.js";
import { validateSidechatEventSequence } from "./sequence.js";

const baseEvent = {
  protocolVersion: "sidechat.v1",
  assistantTurnId: "turn_001",
  createdAt: "2026-05-23T13:00:00.000Z",
} as const;

const started: SidechatStreamEvent = {
  ...baseEvent,
  type: SIDECHAT_EVENT_TYPES.STARTED,
  eventId: "evt_001",
  sequence: 0,
};

const completed: SidechatStreamEvent = {
  ...baseEvent,
  type: SIDECHAT_EVENT_TYPES.COMPLETED,
  eventId: "evt_002",
  sequence: 1,
  finishReason: "stop",
};

describe("validateSidechatEventSequence", () => {
  it("accepts a monotonic stream with one terminal event", () => {
    expect(validateSidechatEventSequence([started, completed])).toEqual({
      terminalEvent: completed,
      eventCount: 2,
    });
  });

  it("accepts a blocked-terminated stream (safety stop is a legal terminal)", () => {
    const blocked: SidechatStreamEvent = {
      ...baseEvent,
      type: SIDECHAT_EVENT_TYPES.BLOCKED,
      eventId: "evt_002",
      sequence: 1,
      reason: "content_filter",
      publicMessage: "This request was blocked by a safety filter.",
    };

    expect(validateSidechatEventSequence([started, blocked])).toEqual({
      terminalEvent: blocked,
      eventCount: 2,
    });
  });

  it("rejects missing terminal events", () => {
    expect(() => validateSidechatEventSequence([started])).toThrow(ProtocolSequenceError);
  });

  it("rejects events after terminal", () => {
    const lateDelta: SidechatStreamEvent = {
      ...baseEvent,
      type: SIDECHAT_EVENT_TYPES.DELTA,
      eventId: "evt_003",
      sequence: 2,
      content: "late",
    };

    expect(() => validateSidechatEventSequence([started, completed, lateDelta])).toThrow(
      ProtocolSequenceError,
    );
  });
});
