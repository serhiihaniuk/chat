import { Stream } from "effect";

/**
 * One parsed cancel-intent signal surfaced by the cancel notification source.
 *
 * The signal carries only the turn identity: it tells the owning instance *which*
 * turn was cancelled, never anything about the turn's events. The durable
 * `cancel_requested_at` column is the source of truth, so a missed or duplicated
 * signal can never lose a cancel — it only changes whether the live fiber is
 * interrupted promptly or terminalized later by the reaper.
 */
export type TurnCancelNotification = {
  readonly assistantTurnId: string;
};

/**
 * Per-instance feed of cancel-intent signals.
 *
 * Persistence owns this because it owns Postgres `LISTEN/NOTIFY`: exactly one
 * dedicated connection per instance listens on `TURN_CANCEL_NOTIFY_CHANNEL` and
 * surfaces parsed notifications here. The service composes this into the cancel
 * dispatcher, which interrupts the local generation fiber when this instance owns
 * the named turn; non-owning instances no-op.
 *
 * The stream is scoped: subscribing acquires the listener and unsubscribing (the
 * scope closing) tears the connection down cleanly.
 */
export type TurnCancelNotificationSource = {
  /** A scoped stream of cancel signals; the scope owns the dedicated connection. */
  readonly notifications: Stream.Stream<TurnCancelNotification>;
};

/**
 * A cancel notification source that never emits.
 *
 * Memory persistence has no cross-process wake signal. A cancel against a
 * memory-backed turn still writes durable intent and (in-process) interrupts via
 * the runner directly, so an empty source is the correct memory behavior.
 */
export const NOOP_TURN_CANCEL_NOTIFICATION_SOURCE: TurnCancelNotificationSource = {
  notifications: Stream.never,
};

/**
 * Parse a raw `pg_notify` payload into a typed cancel signal.
 *
 * The writer sends `JSON.stringify({ assistantTurnId })`; a payload that is
 * missing, malformed, or shaped differently yields `undefined` so the listener
 * skips it instead of faulting the whole feed. A skipped signal is harmless
 * because the durable cancel intent still drives the reaper.
 */
export const parseTurnCancelNotification = (
  payload: string | undefined,
): TurnCancelNotification | undefined => {
  if (!payload) return undefined;
  const parsed = parseJson(payload);
  if (!parsed || typeof parsed !== "object") return undefined;

  const assistantTurnId = (parsed as Record<string, unknown>)["assistantTurnId"];
  if (typeof assistantTurnId !== "string") return undefined;

  return { assistantTurnId };
};

const parseJson = (source: string): unknown => {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    return undefined;
  }
};
