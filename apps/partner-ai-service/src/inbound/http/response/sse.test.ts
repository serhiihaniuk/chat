import {
  SIDECHAT_EVENT_TYPES,
  TURN_ACTIVITY_EVENT_TYPE,
  type SidechatStreamEvent,
  type TurnActivityEvent,
} from "@side-chat/chat-protocol";
import { Duration, Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { streamActivitySseResponse, streamSseResponse } from "./sse.js";

const HEARTBEAT_INTERVAL_MS = 15;
/** Hold each stream open across several heartbeat ticks before it ends. */
const OPEN_WINDOW_MS = 120;

const base = {
  protocolVersion: "sidechat.v1",
  assistantTurnId: "turn_hb",
  createdAt: "2026-07-03T00:00:00.000Z",
} as const;

const started: SidechatStreamEvent = {
  ...base,
  type: SIDECHAT_EVENT_TYPES.STARTED,
  eventId: "evt_0",
  sequence: 0,
  conversationId: "conversation_hb",
};

const completed: SidechatStreamEvent = {
  ...base,
  type: SIDECHAT_EVENT_TYPES.COMPLETED,
  eventId: "evt_1",
  sequence: 1,
  finishReason: "stop",
};

const activityRunning: TurnActivityEvent = {
  type: TURN_ACTIVITY_EVENT_TYPE,
  conversationId: "conversation_hb",
  assistantTurnId: "turn_hb",
  status: "running",
};

/** Emit `first` now, then `last` after the open window, so heartbeats fall between. */
const heldStream = <A>(first: A, last: A): Stream.Stream<A> =>
  Stream.make(first).pipe(
    Stream.concat(
      Stream.fromEffect(Effect.as(Effect.sleep(Duration.millis(OPEN_WINDOW_MS)), last)),
    ),
  );

const readBody = async (response: Response): Promise<string> => {
  const body = response.body;
  if (!body) throw new Error("expected an SSE response body");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
};

const countHeartbeats = (body: string): number => body.split(": hb\n\n").length - 1;

describe("SSE response heartbeats", () => {
  it("interleaves comment heartbeats with turn events and still closes at the terminal", async () => {
    const body = await readBody(
      streamSseResponse(
        heldStream<SidechatStreamEvent>(started, completed),
        "req_hb",
        HEARTBEAT_INTERVAL_MS,
      ),
    );

    expect(countHeartbeats(body)).toBeGreaterThan(0);
    expect(body).toContain(`event: ${SIDECHAT_EVENT_TYPES.STARTED}`);
    expect(body).toContain(`event: ${SIDECHAT_EVENT_TYPES.COMPLETED}`);
  });

  it("emits comment heartbeats on the activity stream", async () => {
    const body = await readBody(
      streamActivitySseResponse(
        heldStream(activityRunning, { ...activityRunning, status: "completed" }),
        "activity_hb",
        HEARTBEAT_INTERVAL_MS,
      ),
    );

    expect(countHeartbeats(body)).toBeGreaterThan(0);
    expect(body).toContain(`event: ${TURN_ACTIVITY_EVENT_TYPE}`);
  });

  it("sends no heartbeat frames when the stream ends before the first tick", async () => {
    const body = await readBody(
      streamSseResponse(Stream.make(started, completed), "req_fast", 10_000),
    );

    expect(countHeartbeats(body)).toBe(0);
    expect(body).toContain(`event: ${SIDECHAT_EVENT_TYPES.COMPLETED}`);
  });
});
