import { ProtocolValidationError } from "./errors.js";
import type { SidechatStreamEvent } from "./events/event-union.js";
import { parseSidechatStreamEvent } from "./validation.js";

export const encodeSseEvent = (event: SidechatStreamEvent): string =>
  `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

export const decodeSseEvents = (stream: string): SidechatStreamEvent[] => {
  const frames = stream
    .split(/\r?\n\r?\n/u)
    .filter((frame) => frame.trim().length > 0);
  return frames.map(decodeFrame);
};

const decodeFrame = (frame: string): SidechatStreamEvent => {
  const dataLines: string[] = [];
  let eventName: string | undefined;
  let eventId: string | undefined;

  for (const line of frame.split(/\r?\n/u)) {
    if (line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    if (separator < 0) throw new ProtocolValidationError("malformed SSE field");
    const field = line.slice(0, separator);
    const value = line.slice(separator + 1).trimStart();
    if (field === "event") eventName = value;
    if (field === "id") eventId = value;
    if (field === "data") dataLines.push(value);
  }

  if (dataLines.length === 0)
    throw new ProtocolValidationError("SSE frame missing data");
  const parsed = parseJson(dataLines.join("\n"));
  const event = parseSidechatStreamEvent(parsed);
  if (eventName && eventName !== event.type) {
    throw new ProtocolValidationError(
      "SSE event field does not match payload type",
    );
  }
  if (eventId && eventId !== event.eventId) {
    throw new ProtocolValidationError(
      "SSE id field does not match payload eventId",
    );
  }
  return event;
};

const parseJson = (source: string): unknown => {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new ProtocolValidationError("SSE data is not valid JSON");
  }
};
