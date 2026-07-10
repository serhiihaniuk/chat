import { ProtocolValidationError } from "../errors.js";

/**
 * The fields of one parsed SSE frame.
 *
 * `dataLines` is empty for a comment-only frame (an SSE keepalive such as
 * `: hb`), which both codecs treat as a no-op rather than a malformed event.
 */
export type SseFrameFields = {
  readonly dataLines: readonly string[];
  readonly eventName: string | undefined;
  readonly eventId: string | undefined;
};

/**
 * Read one SSE frame into its fields, ignoring comment lines.
 *
 * Per the SSE spec a line starting with `:` is a comment and is skipped, so a
 * keepalive frame injected by a proxy or the server heartbeat yields no data
 * lines and is discarded upstream. `data` values accumulate in order so a
 * multi-line payload is preserved; `event` and `id` keep their last value.
 */
export const readSseFrameFields = (frame: string): SseFrameFields =>
  frame.split(/\r?\n/u).reduce<SseFrameFields>(
    (fields, line) => {
      if (line.startsWith(":")) return fields;
      return collectFrameField(fields, parseFrameLine(line));
    },
    { dataLines: [], eventName: undefined, eventId: undefined },
  );

/** Split every non-empty frame from an SSE stream, dropping blank separators. */
export const splitSseFrames = (stream: string): readonly string[] =>
  stream.split(/\r?\n\r?\n/u).filter((frame) => frame.trim().length > 0);

export const parseSseJson = (source: string, message: string): unknown => {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new ProtocolValidationError(message);
  }
};

const parseFrameLine = (line: string): { readonly field: string; readonly value: string } => {
  const separator = line.indexOf(":");
  if (separator < 0) return { field: line, value: "" };

  const rawValue = line.slice(separator + 1);

  return {
    field: line.slice(0, separator),
    // SSE removes one optional ASCII space after the colon, not all leading
    // whitespace. Preserving the rest keeps field values spec-exact.
    value: rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue,
  };
};

const collectFrameField = (
  fields: SseFrameFields,
  parsed: { readonly field: string; readonly value: string },
): SseFrameFields => ({
  dataLines: parsed.field === "data" ? [...fields.dataLines, parsed.value] : fields.dataLines,
  eventName: parsed.field === "event" ? parsed.value : fields.eventName,
  eventId: parsed.field === "id" ? parsed.value : fields.eventId,
});
