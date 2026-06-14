import { ProtocolValidationError } from "../errors.js";
import type { SidechatStreamEvent } from "../events/event-union.js";
import { parseSidechatStreamEvent } from "../validation/validation.js";

export const encodeSseEvent = (event: SidechatStreamEvent): string =>
  `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

export const decodeSseEvents = (stream: string): SidechatStreamEvent[] => {
  const frames = stream.split(/\r?\n\r?\n/u).filter((frame) => frame.trim().length > 0);
  return frames.map(decodeFrame);
};

type DecodedFrameFields = {
  readonly dataLines: readonly string[];
  readonly eventName: string | undefined;
  readonly eventId: string | undefined;
};

const decodeFrame = (frame: string): SidechatStreamEvent => {
  const decoded = readFrameFields(frame);

  if (decoded.dataLines.length === 0) throw new ProtocolValidationError("SSE frame missing data");
  const parsed = parseJson(decoded.dataLines.join("\n"));
  const event = parseSidechatStreamEvent(parsed);
  assertFrameMatchesPayload(decoded, event);
  return event;
};

const readFrameFields = (frame: string): DecodedFrameFields =>
  frame.split(/\r?\n/u).reduce<DecodedFrameFields>(
    (fields, line) => {
      if (line.startsWith(":")) return fields;
      const parsed = parseFrameLine(line);
      return collectFrameField(fields, parsed);
    },
    { dataLines: [] as string[], eventName: undefined, eventId: undefined },
  );

const parseFrameLine = (line: string): { readonly field: string; readonly value: string } => {
  const separator = line.indexOf(":");
  if (separator < 0) throw new ProtocolValidationError("malformed SSE field");

  return {
    field: line.slice(0, separator),
    value: line.slice(separator + 1).trimStart(),
  };
};

const collectFrameField = (
  fields: DecodedFrameFields,
  parsed: { readonly field: string; readonly value: string },
): DecodedFrameFields => ({
  dataLines: parsed.field === "data" ? [...fields.dataLines, parsed.value] : fields.dataLines,
  eventName: parsed.field === "event" ? parsed.value : fields.eventName,
  eventId: parsed.field === "id" ? parsed.value : fields.eventId,
});

const assertFrameMatchesPayload = (
  fields: Pick<DecodedFrameFields, "eventName" | "eventId">,
  event: SidechatStreamEvent,
): void => {
  if (fields.eventName && fields.eventName !== event.type) {
    throw new ProtocolValidationError("SSE event field does not match payload type");
  }
  if (fields.eventId && fields.eventId !== event.eventId) {
    throw new ProtocolValidationError("SSE id field does not match payload eventId");
  }
};

const parseJson = (source: string): unknown => {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new ProtocolValidationError("SSE data is not valid JSON");
  }
};
