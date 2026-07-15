import { describe, expect, it } from "vitest";

import {
  decodeTurnActivitySseEvents,
  encodeTurnActivitySseEvent,
  TURN_ACTIVITY_SYNC_EVENT_TYPE,
  TURN_ACTIVITY_EVENT_TYPE,
  type TurnActivitySyncEvent,
  type TurnActivityEvent,
} from "./activity-sse-codec.js";

const event: TurnActivityEvent = {
  type: TURN_ACTIVITY_EVENT_TYPE,
  conversationId: "conversation_1",
  assistantTurnId: "turn_1",
  status: "running",
};

const syncEvent: TurnActivitySyncEvent = {
  type: TURN_ACTIVITY_SYNC_EVENT_TYPE,
  activeTurns: [
    { conversationId: "conversation_1", assistantTurnId: "turn_1" },
    { conversationId: "conversation_2", assistantTurnId: "turn_2" },
  ],
};

describe("turn-activity SSE codec", () => {
  it("round-trips an event through encode then decode", () => {
    expect(decodeTurnActivitySseEvents(encodeTurnActivitySseEvent(event))).toEqual([event]);
  });

  it("round-trips a synchronization snapshot, including an empty snapshot", () => {
    expect(decodeTurnActivitySseEvents(encodeTurnActivitySseEvent(syncEvent))).toEqual([syncEvent]);
    expect(
      decodeTurnActivitySseEvents(
        encodeTurnActivitySseEvent({ type: TURN_ACTIVITY_SYNC_EVENT_TYPE, activeTurns: [] }),
      ),
    ).toEqual([{ type: TURN_ACTIVITY_SYNC_EVENT_TYPE, activeTurns: [] }]);
  });

  it("decodes multiple frames in order", () => {
    const stream =
      encodeTurnActivitySseEvent(event) +
      encodeTurnActivitySseEvent({ ...event, status: "completed" });

    expect(decodeTurnActivitySseEvents(stream)).toEqual([event, { ...event, status: "completed" }]);
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

  it("ignores comment-only keepalive frames", () => {
    for (const keepalive of [": ping\n\n", ":\n\n", ": hb\n\n"]) {
      expect(decodeTurnActivitySseEvents(keepalive)).toEqual([]);
    }
  });

  it("skips a keepalive interleaved with real events", () => {
    const stream = `${encodeTurnActivitySseEvent(event)}: hb\n\n${encodeTurnActivitySseEvent({
      ...event,
      status: "completed",
    })}`;

    expect(
      decodeTurnActivitySseEvents(stream)
        .filter((decoded) => decoded.type === TURN_ACTIVITY_EVENT_TYPE)
        .map((decoded) => decoded.status),
    ).toEqual(["running", "completed"]);
  });
});
