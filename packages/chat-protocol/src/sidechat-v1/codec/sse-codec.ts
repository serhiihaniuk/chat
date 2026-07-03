import { ProtocolValidationError } from "../errors.js";
import type { SidechatStreamEvent } from "../events/event-union.js";
import { parseSidechatStreamEvent } from "../validation/validation.js";
import {
  parseSseJson,
  readSseFrameFields,
  splitSseFrames,
  type SseFrameFields,
} from "./sse-frame.js";

export const encodeSseEvent = (event: SidechatStreamEvent): string =>
  `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

/**
 * Decode SSE text into validated Side Chat events.
 *
 * Comment-only frames (SSE keepalives, e.g. `: hb`) carry no data and are
 * skipped, so a proxy or server heartbeat never breaks the stream. The frame id
 * and event name must match the JSON payload so a malformed frame cannot pretend
 * to be a different event.
 */
export const decodeSseEvents = (stream: string): SidechatStreamEvent[] =>
  splitSseFrames(stream).flatMap((frame) => {
    const event = decodeFrame(frame);
    return event ? [event] : [];
  });

const decodeFrame = (frame: string): SidechatStreamEvent | undefined => {
  const decoded = readSseFrameFields(frame);
  // A keepalive/comment-only frame has no data lines; ignore it per the SSE spec.
  if (decoded.dataLines.length === 0) return undefined;

  const parsed = parseSseJson(decoded.dataLines.join("\n"), "SSE data is not valid JSON");
  const event = parseSidechatStreamEvent(parsed);
  assertFrameMatchesPayload(decoded, event);
  return event;
};

const assertFrameMatchesPayload = (
  fields: Pick<SseFrameFields, "eventName" | "eventId">,
  event: SidechatStreamEvent,
): void => {
  if (fields.eventName && fields.eventName !== event.type) {
    throw new ProtocolValidationError("SSE event field does not match payload type");
  }
  if (fields.eventId && fields.eventId !== event.eventId) {
    throw new ProtocolValidationError("SSE id field does not match payload eventId");
  }
};
