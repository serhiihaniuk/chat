import { NOOP_OBSERVABILITY_SINK, type ObservabilitySinkPort } from "@side-chat/partner-ai-core";
import type { DiagnosticLogLevel, DiagnosticLogger } from "@side-chat/shared";

import { createJsonConsoleLogger, createPrettyConsoleLogger } from "./console-diagnostic-logger.js";
import { createConsoleObservabilitySink } from "./console-observability-sink.js";

/**
 * Console-first observability wiring: a diagnostic logger and the default sink.
 *
 * Kept in the observability adapter (not the config adapter) because both
 * construct console adapters; the config layer resolves the level/format/profile
 * and hands them here as plain values.
 */
export const createConsoleDiagnosticLogger = (options: {
  readonly level: DiagnosticLogLevel;
  readonly format: "pretty" | "json";
}): DiagnosticLogger =>
  options.format === "json"
    ? createJsonConsoleLogger({ level: options.level })
    : createPrettyConsoleLogger({ level: options.level });

/**
 * The default telemetry sink: the real console sink or the no-op.
 *
 * `useConsole` is the development profile in practice; production passes `false`
 * and stays on the no-op until an adopter installs a real sink. An explicit
 * `options.observability` always wins because composition never overrides it.
 */
export const createDefaultObservabilitySink = (
  useConsole: boolean,
  logger: DiagnosticLogger,
): ObservabilitySinkPort =>
  useConsole ? createConsoleObservabilitySink(logger) : NOOP_OBSERVABILITY_SINK;
