import { Stream } from "effect";
import { parseJsonRecord } from "@side-chat/shared";

/**
 * One parsed update for the subject's running-turn indicators.
 *
 * The full scope lets the dispatcher route the update without another database
 * read. `running` means the turn is generating; every other status is terminal.
 * This feed has no replay. Subscribers get a fresh snapshot when they connect.
 */
export type TurnActivityNotification = {
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly conversationId: string;
  readonly assistantTurnId: string;
  readonly status: string;
};

/**
 * Per-instance feed of turn-lifecycle signals.
 *
 * Persistence owns the Postgres `LISTEN/NOTIFY` connection and exposes parsed
 * updates here. The service composes this feed into its activity dispatcher; it
 * does not open a database listener itself.
 */
export type TurnActivityNotificationSource = {
  /** A scoped stream of lifecycle signals; the scope owns the dedicated connection. */
  readonly notifications: Stream.Stream<TurnActivityNotification>;
};

/**
 * A notification source for memory persistence, which has no live wake signal.
 *
 * The activity stream still sends its current snapshot on connect. It simply
 * cannot send live changes between processes.
 */
export const NOOP_TURN_ACTIVITY_NOTIFICATION_SOURCE: TurnActivityNotificationSource = {
  notifications: Stream.never,
};

/**
 * Parse a raw `pg_notify` payload into a typed lifecycle signal.
 *
 * A payload that is missing, malformed, or shaped differently yields `undefined`
 * so the listener skips it instead of faulting the whole feed.
 */
export const parseTurnActivityNotification = (
  payload: string | undefined,
): TurnActivityNotification | undefined => {
  if (!payload) return undefined;
  const candidate = parseJsonRecord(payload);
  if (!candidate) return undefined;
  const workspaceId = candidate["workspaceId"];
  const subjectId = candidate["subjectId"];
  const conversationId = candidate["conversationId"];
  const assistantTurnId = candidate["assistantTurnId"];
  const status = candidate["status"];
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
