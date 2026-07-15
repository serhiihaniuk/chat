import { Stream } from "effect";
import { parseJsonRecord } from "@side-chat/shared";

/** Identity-only signal emitted when one assistant turn starts or terminalizes. */
export type TurnActivityNotification = {
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly conversationId: string;
  readonly assistantTurnId: string;
  readonly status: string;
};

/** Per-process feed backed by one persistence-owned notification connection. */
export type TurnActivityNotificationSource = {
  readonly notifications: Stream.Stream<TurnActivityNotification>;
};

/** Memory persistence publishes directly, so callers without a source can stay idle. */
export const NOOP_TURN_ACTIVITY_NOTIFICATION_SOURCE: TurnActivityNotificationSource = {
  notifications: Stream.never,
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
  const status = record["status"];
  if (
    typeof workspaceId !== "string" ||
    typeof subjectId !== "string" ||
    typeof conversationId !== "string" ||
    typeof assistantTurnId !== "string" ||
    typeof status !== "string"
  ) {
    return undefined;
  }
  return { workspaceId, subjectId, conversationId, assistantTurnId, status };
};
