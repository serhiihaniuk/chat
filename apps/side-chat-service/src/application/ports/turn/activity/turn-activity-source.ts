/** Persistence signal carrying only the identity needed for subject fan-out. */
export type TurnActivityNotification = Readonly<{
  workspaceId: string;
  subjectId: string;
  conversationId: string;
  assistantTurnId: string;
}>;

/** One per-process lifecycle feed; production is Postgres, memory publishes locally. */
export type TurnActivityNotificationSource = Readonly<{
  openNotifications: () => ReadableStream<TurnActivityNotification>;
}>;
