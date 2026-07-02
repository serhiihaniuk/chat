import { Stream } from "effect";

/**
 * One parsed host-command-result signal surfaced by the result notification source.
 *
 * The signal carries only identity: it tells the owning instance *which* pending
 * command was answered, never the result body. The durable `host_command_results`
 * row is the source of truth, so a missed or duplicated signal can never lose a
 * result — it only changes whether the paused tool loop resumes promptly or on
 * its next low-frequency result poll.
 */
export type HostCommandResultNotification = {
  readonly assistantTurnId: string;
  readonly commandId: string;
};

/**
 * Per-instance feed of host-command-result signals.
 *
 * Persistence owns this because it owns Postgres `LISTEN/NOTIFY`: exactly one
 * dedicated connection per instance listens on `HOST_COMMAND_RESULT_NOTIFY_CHANNEL`
 * and surfaces parsed notifications here. The service composes this into the
 * host-command result dispatcher, which settles the local pending promise when
 * this instance owns the paused tool loop; non-owning instances no-op.
 */
export type HostCommandResultNotificationSource = {
  /** A scoped stream of result signals; the scope owns the dedicated connection. */
  readonly notifications: Stream.Stream<HostCommandResultNotification>;
};

/**
 * A result notification source that never emits.
 *
 * Memory persistence has no cross-process wake signal. A memory-backed result
 * still settles in-process through the route's direct resolver call, so an empty
 * source is the correct memory behavior.
 */
export const NOOP_HOST_COMMAND_RESULT_NOTIFICATION_SOURCE: HostCommandResultNotificationSource = {
  notifications: Stream.never,
};

/**
 * Parse a raw `pg_notify` payload into a typed result signal.
 *
 * The writer sends `JSON.stringify({ assistantTurnId, commandId })`; a payload
 * that is missing, malformed, or shaped differently yields `undefined` so the
 * listener skips it instead of faulting the whole feed. A skipped signal is
 * harmless because the owner's result poll still reads the durable row.
 */
export const parseHostCommandResultNotification = (
  payload: string | undefined,
): HostCommandResultNotification | undefined => {
  if (!payload) return undefined;
  const parsed = parseJson(payload);
  if (!parsed || typeof parsed !== "object") return undefined;

  const record = parsed as Record<string, unknown>;
  const assistantTurnId = record["assistantTurnId"];
  const commandId = record["commandId"];
  if (typeof assistantTurnId !== "string" || typeof commandId !== "string") return undefined;

  return { assistantTurnId, commandId };
};

const parseJson = (source: string): unknown => {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    return undefined;
  }
};
