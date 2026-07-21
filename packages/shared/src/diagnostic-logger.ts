import type { JsonObject } from "./json.js";

export const DIAGNOSTIC_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type DiagnosticLogLevel = (typeof DIAGNOSTIC_LOG_LEVELS)[number];

/** Structured fields attached to a diagnostic line; redacted before output. */
export type DiagnosticLogFields = JsonObject;

/**
 * Plain, synchronous, leveled logger for operational events that have no turn.
 *
 * Boot summary, config fallback, LISTEN connect/drop, fiber/finalizer failures,
 * shutdown — the events the turn-scoped `ObservabilitySinkPort` cannot carry.
 * The contract is zero-dep and Effect-free so `db`, core, and the service can all
 * accept it without a new dependency. Two rules bind every implementation: it is
 * **fail-open** (a logging failure never propagates to the caller), and it
 * applies `redactAttributes` to `fields` before output so no level reveals
 * prompts, model output, tool payloads, or secrets.
 */
export type DiagnosticLogger = {
  readonly debug: (message: string, fields?: DiagnosticLogFields) => void;
  readonly info: (message: string, fields?: DiagnosticLogFields) => void;
  readonly warn: (message: string, fields?: DiagnosticLogFields) => void;
  readonly error: (message: string, fields?: DiagnosticLogFields) => void;
};

/** No-op logger for tests, silent compositions, and default arguments. */
export const SILENT_DIAGNOSTIC_LOGGER: DiagnosticLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * Whether a message at `level` should emit given the configured minimum.
 *
 * Ordering is `debug < info < warn < error`; a `warn` minimum emits `warn` and
 * `error` only. Console implementations use this for level filtering.
 */
export const shouldEmitDiagnostic = (
  configuredMinimum: DiagnosticLogLevel,
  level: DiagnosticLogLevel,
): boolean =>
  DIAGNOSTIC_LOG_LEVELS.indexOf(level) >= DIAGNOSTIC_LOG_LEVELS.indexOf(configuredMinimum);
