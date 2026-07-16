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
