export const TURN_ACTIVITY_KIND = {
  SNAPSHOT: "snapshot",
  TRANSITION: "transition",
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
  running: boolean;
}>;

export type TurnActivity = TurnActivitySnapshot | TurnActivityTransition;
