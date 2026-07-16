import { isRecord } from "@side-chat/shared";

export const TURN_ACTIVITY_EVENT_TYPE = "sidechat.turn-activity" as const;
export const TURN_ACTIVITY_SYNC_EVENT_TYPE = "sidechat.turn-activity-sync" as const;

export type TurnActivitySyncEvent = Readonly<{
  type: typeof TURN_ACTIVITY_SYNC_EVENT_TYPE;
  activeTurns: readonly Readonly<{
    conversationId: string;
    assistantTurnId: string;
  }>[];
}>;

export type TurnActivityEvent = Readonly<{
  type: typeof TURN_ACTIVITY_EVENT_TYPE;
  conversationId: string;
  assistantTurnId: string;
  status: string;
}>;

export type TurnActivityStreamEvent = TurnActivitySyncEvent | TurnActivityEvent;

export const isRunningActivity = (event: TurnActivityEvent): boolean => event.status === "running";

/** Decode one complete advisory SSE frame at the widget trust boundary. */
export function decodeWorkflowActivitySseFrame(frame: string): readonly TurnActivityStreamEvent[] {
  const fields = readFrameFields(frame);
  if (fields.data.length === 0) return [];
  const event = parseTurnActivityStreamEvent(JSON.parse(fields.data.join("\n")));
  if (fields.eventName !== undefined && fields.eventName !== event.type) {
    throw new TypeError("Activity SSE event name does not match its payload");
  }
  return [event];
}

function readFrameFields(frame: string): Readonly<{
  eventName: string | undefined;
  data: readonly string[];
}> {
  let eventName: string | undefined;
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/u)) {
    if (line.startsWith("event:")) eventName = line.slice("event:".length).trimStart();
    if (line.startsWith("data:")) data.push(line.slice("data:".length).trimStart());
  }
  return { eventName, data };
}

function parseTurnActivityStreamEvent(value: unknown): TurnActivityStreamEvent {
  if (!isRecord(value)) throw new TypeError("Malformed activity event");
  return value["type"] === TURN_ACTIVITY_SYNC_EVENT_TYPE
    ? parseTurnActivitySyncEvent(value)
    : parseTurnActivityEvent(value);
}

function parseTurnActivitySyncEvent(value: Record<string, unknown>): TurnActivitySyncEvent {
  const activeTurns = value["activeTurns"];
  if (value["type"] !== TURN_ACTIVITY_SYNC_EVENT_TYPE || !Array.isArray(activeTurns)) {
    throw new TypeError("Malformed activity synchronization event");
  }
  return {
    type: TURN_ACTIVITY_SYNC_EVENT_TYPE,
    activeTurns: activeTurns.map(parseActiveTurn),
  };
}

function parseActiveTurn(value: unknown): TurnActivitySyncEvent["activeTurns"][number] {
  if (
    !isRecord(value) ||
    typeof value["conversationId"] !== "string" ||
    typeof value["assistantTurnId"] !== "string"
  ) {
    throw new TypeError("Malformed active turn identity");
  }
  return {
    conversationId: value["conversationId"],
    assistantTurnId: value["assistantTurnId"],
  };
}

function parseTurnActivityEvent(value: Record<string, unknown>): TurnActivityEvent {
  if (
    value["type"] !== TURN_ACTIVITY_EVENT_TYPE ||
    typeof value["conversationId"] !== "string" ||
    typeof value["assistantTurnId"] !== "string" ||
    typeof value["status"] !== "string"
  ) {
    throw new TypeError("Malformed activity transition event");
  }
  return {
    type: TURN_ACTIVITY_EVENT_TYPE,
    conversationId: value["conversationId"],
    assistantTurnId: value["assistantTurnId"],
    status: value["status"],
  };
}
