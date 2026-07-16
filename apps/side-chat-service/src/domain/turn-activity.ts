export const TURN_ACTIVITY_KIND = {
  SNAPSHOT: "snapshot",
  TRANSITION: "transition",
} as const;

export const TURN_ACTIVITY_STATUS = {
  RUNNING: "running",
  TERMINAL: "terminal",
} as const;

export type TurnActivitySnapshot = Readonly<{
  kind: typeof TURN_ACTIVITY_KIND.SNAPSHOT;
  activeTurns: readonly Readonly<{
    conversationId: string;
    assistantTurnId: string;
  }>[];
}>;

export type TurnActivityTransition = Readonly<{
  kind: typeof TURN_ACTIVITY_KIND.TRANSITION;
  conversationId: string;
  assistantTurnId: string;
  status: (typeof TURN_ACTIVITY_STATUS)[keyof typeof TURN_ACTIVITY_STATUS];
}>;

export type TurnActivity = TurnActivitySnapshot | TurnActivityTransition;
