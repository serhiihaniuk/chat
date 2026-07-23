/**
 * Content-free activity events carried on the subject-scoped SSE side channel.
 *
 * Events are advisory reconciliation hints, not message or terminal authority;
 * clients repair missed hints from the durable conversation-state endpoint.
 */
export const TURN_ACTIVITY_EVENT_TYPE = "sidechat.turn-activity" as const;
export const TURN_ACTIVITY_SYNC_EVENT_TYPE = "sidechat.turn-activity-sync" as const;

export const TURN_ACTIVITY_STATUS = {
  RUNNING: "running",
  TERMINAL: "terminal",
} as const;

export type TurnActivityStatus = (typeof TURN_ACTIVITY_STATUS)[keyof typeof TURN_ACTIVITY_STATUS];

export function isTurnActivityStatus(value: unknown): value is TurnActivityStatus {
  return Object.values(TURN_ACTIVITY_STATUS).some((status) => status === value);
}

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
  status: TurnActivityStatus;
}>;

export type TurnActivityStreamEvent = TurnActivitySyncEvent | TurnActivityEvent;
