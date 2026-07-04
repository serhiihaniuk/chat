import {
  redactAttributes,
  shouldEmitDiagnostic,
  type DiagnosticLogFields,
  type DiagnosticLogger,
  type DiagnosticLogLevel,
  type JsonObject,
  type JsonValue,
} from "@side-chat/shared";

/**
 * Console `DiagnosticLogger` implementations — the shipped default for dev and prod.
 *
 * Both apply the shared `redactAttributes` to fields before writing, filter by a
 * configured minimum level, and are fail-open: a formatting or console error is
 * swallowed so a log line can never fault the caller. `pretty` is a one-line
 * human format for a developer watching the console; `json` is one JSON object
 * per line for a production log aggregator.
 */
export type ConsoleDiagnosticLoggerOptions = {
  readonly level: DiagnosticLogLevel;
  /** Injectable clock for deterministic tests; defaults to the wall clock. */
  readonly now?: (() => Date) | undefined;
};

export const createPrettyConsoleLogger = (
  options: ConsoleDiagnosticLoggerOptions,
): DiagnosticLogger => createLogger(options, formatPrettyLine);

export const createJsonConsoleLogger = (
  options: ConsoleDiagnosticLoggerOptions,
): DiagnosticLogger => createLogger(options, formatJsonLine);

type LineFormatter = (
  level: DiagnosticLogLevel,
  message: string,
  fields: JsonObject,
  at: Date,
) => string;

const createLogger = (
  options: ConsoleDiagnosticLoggerOptions,
  format: LineFormatter,
): DiagnosticLogger => {
  const clock = options.now ?? (() => new Date());
  const emit = (level: DiagnosticLogLevel, message: string, fields?: DiagnosticLogFields): void => {
    if (!shouldEmitDiagnostic(options.level, level)) return;
    // Fail-open: redaction, formatting, or the console call must never throw back
    // to the caller — a diagnostic line is never worth faulting real work.
    try {
      const safe = fields ? redactAttributes(fields) : {};
      writeToConsole(level, format(level, message, safe, clock()));
    } catch {
      // A logger that cannot log stays silent rather than crashing the process.
    }
  };

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
  };
};

// debug/info go to stdout, warn/error to stderr — the conventional split, so a
// dev sees everything and an operator can filter severities by stream.
const writeToConsole = (level: DiagnosticLogLevel, line: string): void => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

const formatPrettyLine = (
  level: DiagnosticLogLevel,
  message: string,
  fields: JsonObject,
  at: Date,
): string => {
  const time = at.toISOString().slice(11, 23);
  const label = level.toUpperCase().padEnd(5, " ");
  const rendered = renderFields(fields);
  return rendered ? `${time} ${label} ${message} ${rendered}` : `${time} ${label} ${message}`;
};

const formatJsonLine = (
  level: DiagnosticLogLevel,
  message: string,
  fields: JsonObject,
  at: Date,
): string => JSON.stringify({ time: at.toISOString(), level, message, ...fields });

// Compact `key=value` rendering; non-scalar values are JSON-encoded so a nested
// object still reads on one line.
const renderFields = (fields: JsonObject): string =>
  Object.entries(fields)
    .map(([key, value]) => `${key}=${renderValue(value)}`)
    .join(" ");

const renderValue = (value: JsonValue): string =>
  typeof value === "string" ? value : JSON.stringify(value);
