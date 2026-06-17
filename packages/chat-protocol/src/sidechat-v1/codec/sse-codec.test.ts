import { describe, expect, it } from "vitest";
import { ProtocolValidationError } from "../errors.js";
import { SIDECHAT_EVENT_TYPES, type SidechatStreamEvent } from "../events/event-union.js";
import { decodeSseEvents, encodeSseEvent } from "./sse-codec.js";

const base = {
  protocolVersion: "sidechat.v1",
  eventId: "evt_001",
  assistantTurnId: "turn_001",
  sequence: 0,
  createdAt: "2026-05-23T13:00:00.000Z",
} as const;

const event: SidechatStreamEvent = {
  ...base,
  type: SIDECHAT_EVENT_TYPES.COMPLETED,
  finishReason: "stop",
};

const errorEvent: SidechatStreamEvent = {
  ...base,
  type: SIDECHAT_EVENT_TYPES.ERROR,
  code: "provider_failed",
  message: "Provider failed.",
  retryable: true,
};

const blockedEvent: SidechatStreamEvent = {
  ...base,
  type: SIDECHAT_EVENT_TYPES.BLOCKED,
  reason: "content_filter",
  publicMessage: "The assistant cannot complete this response because it was blocked.",
};

describe("SSE codec", () => {
  it("round-trips typed events", () => {
    expect(decodeSseEvents(encodeSseEvent(event))).toEqual([event]);
  });

  it("preserves each terminal event across encode and decode", () => {
    for (const terminal of [event, errorEvent, blockedEvent]) {
      expect(decodeSseEvents(encodeSseEvent(terminal))).toEqual([terminal]);
    }
  });

  it("rejects mismatched SSE event names", () => {
    const frame = encodeSseEvent(event).replace("event: sidechat.completed", "event: text-delta");

    expect(() => decodeSseEvents(frame)).toThrow(ProtocolValidationError);
  });
});
