import { ProtocolValidationError } from "../errors.js";
import { isRecord } from "../primitives.js";

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

/** Decode SSE text into validated turn-activity events (one per frame). */
export const decodeTurnActivitySseEvents = (stream: string): TurnActivityEvent[] => {
  const frames = stream.split(/\r?\n\r?\n/u).filter((frame) => frame.trim().length > 0);
  return frames.map(decodeFrame);
};

const decodeFrame = (frame: string): TurnActivityEvent => {
  const dataLine = frame.split(/\r?\n/u).find((line) => line.startsWith("data:"));
  if (!dataLine) throw new ProtocolValidationError("activity SSE frame missing data");
  return parseTurnActivityEvent(parseJson(dataLine.slice(dataLine.indexOf(":") + 1).trimStart()));
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

const parseJson = (source: string): unknown => {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new ProtocolValidationError("activity SSE data is not valid JSON");
  }
};
