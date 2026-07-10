import { Stream } from "effect";
import { parseJsonRecord } from "@side-chat/shared";

/**
 * One parsed signal for a saved cancel request.
 *
 * It carries only the turn id. The durable `cancel_requested_at` column is the
 * source of truth, so a missed or duplicate signal cannot lose a cancel. It only
 * changes whether the live fiber stops now or the reaper finishes it later.
 */
export type TurnCancelNotification = {
  readonly assistantTurnId: string;
};

/**
 * Per-instance feed of saved cancel requests.
 *
 * Persistence owns the Postgres listener and exposes parsed signals here. The
 * service uses them to interrupt a local generation fiber when this instance owns
 * the turn; other instances do nothing. The stream is scoped, so closing it also
 * closes the listener connection.
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
  const parsed = parseJsonRecord(payload);
  if (!parsed) return undefined;

  const assistantTurnId = parsed["assistantTurnId"];
  if (typeof assistantTurnId !== "string") return undefined;

  return { assistantTurnId };
};
