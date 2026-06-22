import { describe, expect, it } from "vitest";

import {
  decodeTurnActivitySseEvents,
  encodeTurnActivitySseEvent,
  TURN_ACTIVITY_EVENT_TYPE,
  type TurnActivityEvent,
} from "./activity-sse-codec.js";

const event: TurnActivityEvent = {
  type: TURN_ACTIVITY_EVENT_TYPE,
  conversationId: "conversation_1",
  assistantTurnId: "turn_1",
  status: "running",
};

describe("turn-activity SSE codec", () => {
  it("round-trips an event through encode then decode", () => {
    expect(decodeTurnActivitySseEvents(encodeTurnActivitySseEvent(event))).toEqual([event]);
  });

  it("decodes multiple frames in order", () => {
    const stream =
      encodeTurnActivitySseEvent(event) +
      encodeTurnActivitySseEvent({ ...event, status: "completed" });

    expect(decodeTurnActivitySseEvents(stream).map((decoded) => decoded.status)).toEqual([
      "running",
      "completed",
    ]);
  });

  it("rejects a frame whose data is not valid JSON", () => {
    expect(() =>
      decodeTurnActivitySseEvents(`event: ${TURN_ACTIVITY_EVENT_TYPE}\ndata: not json\n\n`),
    ).toThrow("not valid JSON");
  });

  it("rejects a payload missing required fields", () => {
    expect(() =>
      decodeTurnActivitySseEvents(
        `data: ${JSON.stringify({ type: TURN_ACTIVITY_EVENT_TYPE, conversationId: "c" })}\n\n`,
      ),
    ).toThrow("malformed turn-activity event");
  });
});
