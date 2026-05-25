import { describe, expect, it } from "vitest";
import { ProtocolValidationError } from "./errors.js";
import {
  SIDECHAT_EVENT_TYPES,
  type SidechatStreamEvent,
} from "./events/event-union.js";
import { decodeSseEvents, encodeSseEvent } from "./sse-codec.js";

const event: SidechatStreamEvent = {
  protocolVersion: "sidechat.v1",
  type: SIDECHAT_EVENT_TYPES.COMPLETED,
  eventId: "evt_001",
  assistantTurnId: "turn_001",
  sequence: 0,
  createdAt: "2026-05-23T13:00:00.000Z",
  finishReason: "stop",
};

describe("SSE codec", () => {
  it("round-trips typed events", () => {
    expect(decodeSseEvents(encodeSseEvent(event))).toEqual([event]);
  });

  it("rejects mismatched SSE event names", () => {
    const frame = encodeSseEvent(event).replace(
      "event: sidechat.completed",
      "event: text-delta",
    );

    expect(() => decodeSseEvents(frame)).toThrow(ProtocolValidationError);
  });
});
