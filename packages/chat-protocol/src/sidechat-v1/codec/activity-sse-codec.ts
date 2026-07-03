import { ProtocolValidationError } from "../errors.js";
import { isRecord } from "../primitives.js";
import { parseSseJson, readSseFrameFields, splitSseFrames } from "./sse-frame.js";

/**
 * Cross-conversation turn lifecycle, pushed on the subject-scoped activity stream.
 *
 * Distinct from the in-turn `ActivityEvent` (reasoning/tool steps): this says
 * "conversation X's turn is now <status>" so the sidebar can show a live dot on a
 * chat the user is not viewing. `status` is the assistant turn status — `running`
 * means generating; any other value is terminal. The stream itself is already
 * scoped to one (workspace, subject), so the wire event carries no scope.
 */
export const TURN_ACTIVITY_EVENT_TYPE = "sidechat.turn-activity" as const;

export type TurnActivityEvent = {
  readonly type: typeof TURN_ACTIVITY_EVENT_TYPE;
  readonly conversationId: string;
  readonly assistantTurnId: string;
  readonly status: string;
};

/** A turn is generating (vs. any terminal status). */
export const isRunningActivity = (event: TurnActivityEvent): boolean => event.status === "running";

export const encodeTurnActivitySseEvent = (event: TurnActivityEvent): string =>
  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

/**
 * Decode SSE text into validated turn-activity events.
 *
 * Comment-only frames (keepalives, e.g. `: hb`) carry no data and are skipped,
 * so the server heartbeat or a proxy keepalive never breaks the activity stream.
 * Multi-line `data` payloads are joined, and the `event` field is cross-checked
 * against the payload type — matching the main `sidechat.v1` codec.
 */
export const decodeTurnActivitySseEvents = (stream: string): TurnActivityEvent[] =>
  splitSseFrames(stream).flatMap((frame) => {
    const event = decodeFrame(frame);
    return event ? [event] : [];
  });

const decodeFrame = (frame: string): TurnActivityEvent | undefined => {
  const fields = readSseFrameFields(frame);
  // A keepalive/comment-only frame has no data lines; ignore it per the SSE spec.
  if (fields.dataLines.length === 0) return undefined;

  const event = parseTurnActivityEvent(
    parseSseJson(fields.dataLines.join("\n"), "activity SSE data is not valid JSON"),
  );
  if (fields.eventName && fields.eventName !== event.type) {
    throw new ProtocolValidationError("activity SSE event field does not match payload type");
  }
  return event;
};

export const parseTurnActivityEvent = (value: unknown): TurnActivityEvent => {
  if (
    !isRecord(value) ||
    value["type"] !== TURN_ACTIVITY_EVENT_TYPE ||
    typeof value["conversationId"] !== "string" ||
    typeof value["assistantTurnId"] !== "string" ||
    typeof value["status"] !== "string"
  ) {
    throw new ProtocolValidationError("malformed turn-activity event");
  }
  return {
    type: TURN_ACTIVITY_EVENT_TYPE,
    conversationId: value["conversationId"],
    assistantTurnId: value["assistantTurnId"],
    status: value["status"],
  };
};
