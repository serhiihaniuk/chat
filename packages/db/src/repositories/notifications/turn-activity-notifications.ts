import { parseJsonRecord } from "@side-chat/shared";

/** Identity-only invalidation emitted when one assistant turn changes lifecycle. */
export type TurnActivityNotification = {
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly conversationId: string;
  readonly assistantTurnId: string;
};

/** Native per-process feed backed by one persistence-owned notification connection. */
export type TurnActivityNotificationSource = {
  readonly openNotifications: () => ReadableStream<TurnActivityNotification>;
};

/** Memory persistence publishes directly, so callers without a source can stay idle. */
export const NOOP_TURN_ACTIVITY_NOTIFICATION_SOURCE: TurnActivityNotificationSource = {
  openNotifications: () => new ReadableStream<TurnActivityNotification>(),
};

/** Reject malformed or content-bearing database notifications at the adapter edge. */
export const parseTurnActivityNotification = (
  payload: string | undefined,
): TurnActivityNotification | undefined => {
  if (!payload) return undefined;
  const record = parseJsonRecord(payload);
  if (!record) return undefined;
  const workspaceId = record["workspaceId"];
  const subjectId = record["subjectId"];
  const conversationId = record["conversationId"];
  const assistantTurnId = record["assistantTurnId"];
  if (
    typeof workspaceId !== "string" ||
    typeof subjectId !== "string" ||
    typeof conversationId !== "string" ||
    typeof assistantTurnId !== "string"
  ) {
    return undefined;
  }
  return { workspaceId, subjectId, conversationId, assistantTurnId };
};
