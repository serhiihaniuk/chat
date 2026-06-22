import { Stream } from "effect";

/**
 * One parsed turn-lifecycle signal for the subject-scoped activity stream.
 *
 * Carries the full scope so the dispatcher can fan out by `(workspaceId,
 * subjectId)` and forward `{ conversationId, assistantTurnId, status }` to clients
 * without a per-signal read. `status` is the assistant turn status — `running`
 * means generating; any other value is terminal. Unlike the durable `turn_events`
 * log, there is no replay: initial state comes from a snapshot on connect, so a
 * dropped signal self-corrects on the next transition or reconnect.
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
 * Persistence owns this because it owns Postgres `LISTEN/NOTIFY`: one dedicated
 * connection per instance listens on `TURN_ACTIVITY_NOTIFY_CHANNEL` and surfaces
 * parsed notifications here. The service composes this into its activity
 * dispatcher; it never opens a `LISTEN` connection itself.
 */
export type TurnActivityNotificationSource = {
  /** A scoped stream of lifecycle signals; the scope owns the dedicated connection. */
  readonly notifications: Stream.Stream<TurnActivityNotification>;
};

/**
 * A notification source that never emits.
 *
 * Memory persistence has no cross-process wake signal. The activity stream still
 * serves its snapshot of currently-running turns on connect; it just never
 * receives live transitions — the correct memory behavior (mirrors the turn-event
 * memory source).
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
  const parsed = parseJson(payload);
  if (!parsed || typeof parsed !== "object") return undefined;

  const candidate = parsed as Record<string, unknown>;
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

const parseJson = (source: string): unknown => {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    return undefined;
  }
};
