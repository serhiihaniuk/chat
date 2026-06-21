import { Stream } from "effect";

/**
 * One parsed `turn_events` change signal surfaced by the notification source.
 *
 * The signal carries only the identity and the appended sequence: it tells a
 * subscriber *when* a turn advanced, never *what* the event was. The durable log
 * (`readEventsAfter`) is the source of truth for content, so a missed or
 * duplicated signal can never corrupt a stream — it only changes timing.
 */
export type TurnEventNotification = {
  readonly assistantTurnId: string;
  readonly sequence: number;
};

/**
 * Per-instance feed of `turn_events` append signals.
 *
 * Persistence owns this because it owns Postgres `LISTEN/NOTIFY`: exactly one
 * dedicated connection per instance listens on `TURN_EVENTS_NOTIFY_CHANNEL` and
 * surfaces parsed notifications here. The service composes this into its fan-out
 * dispatcher; it never opens a `LISTEN` connection itself.
 *
 * The stream is scoped: subscribing acquires the listener and unsubscribing (the
 * scope closing) tears the connection down cleanly. Consuming it more than once
 * is allowed — each consumer gets its own scoped listener.
 */
export type TurnEventNotificationSource = {
  /** A scoped stream of append signals; the scope owns the dedicated connection. */
  readonly notifications: Stream.Stream<TurnEventNotification>;
};

/**
 * A notification source that never emits.
 *
 * Memory persistence has no cross-process wake signal, and the subscriber safety
 * poll already reads the in-memory log on its cadence, so an empty source is the
 * correct memory behavior: delivery still happens, just poll-driven rather than
 * notify-driven.
 */
export const NOOP_TURN_EVENT_NOTIFICATION_SOURCE: TurnEventNotificationSource = {
  notifications: Stream.never,
};

/**
 * Parse a raw `pg_notify` payload into a typed append signal.
 *
 * The writer sends `JSON.stringify({ assistantTurnId, sequence })`; a payload
 * that is missing, malformed, or shaped differently yields `undefined` so the
 * listener skips it instead of faulting the whole feed. A skipped signal is
 * harmless because the safety poll still advances the affected subscriber.
 */
export const parseTurnEventNotification = (
  payload: string | undefined,
): TurnEventNotification | undefined => {
  if (!payload) return undefined;
  const parsed = parseJson(payload);
  if (!parsed || typeof parsed !== "object") return undefined;

  const candidate = parsed as Record<string, unknown>;
  const assistantTurnId = candidate["assistantTurnId"];
  const sequence = candidate["sequence"];
  if (typeof assistantTurnId !== "string" || typeof sequence !== "number") return undefined;

  return { assistantTurnId, sequence };
};

const parseJson = (source: string): unknown => {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    return undefined;
  }
};
