import { Effect } from "effect";
import {
  parseSsePayload,
  type SidechatStreamEvent,
} from "@side-chat/shared-protocol";
import { decodeKnownFramePayload } from "../../../application/stream-decoding/stream-event-decoder.js";

const knownEventTypes = new Set([
  "sidechat.started",
  "sidechat.delta",
  "sidechat.reasoning",
  "sidechat.tool",
  "sidechat.host_command",
  "sidechat.completed",
  "sidechat.error",
  "sidechat.history",
]);

const parseKnownFramePayload = (
  data: string,
): SidechatStreamEvent | undefined => {
  return Effect.runSync(decodeKnownFramePayload(data));
};

/**
 * Reads protocol frames from an HTTP response. This adapter owns the browser
 * stream details; downstream widget state receives typed sidechat.v1 events.
 */
export const readSideChatStreamEvents = async (
  response: globalThis.Response,
  onEvent: (event: SidechatStreamEvent) => void,
  onMalformedEvent?: (message: string) => void,
): Promise<void> => {
  let terminalSeen = false;
  const emit = (chunk: string) => {
    for (const payload of parseSsePayload(chunk)) {
      if (payload.event && !knownEventTypes.has(payload.event)) {
        continue;
      }

      const parsed = parseKnownFramePayload(payload.data);
      if (parsed) {
        if (terminalSeen) {
          onMalformedEvent?.(
            `Ignored ${parsed.type} after terminal sidechat stream event`,
          );
          continue;
        }

        onEvent(parsed);
        terminalSeen =
          parsed.type === "sidechat.completed" ||
          parsed.type === "sidechat.error";
        continue;
      }

      onMalformedEvent?.(
        `Malformed ${payload.event ?? "sidechat"} stream event`,
      );
    }
  };

  if (!response.body) {
    emit(await response.text());
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  const flushCompleteFrames = () => {
    for (;;) {
      const boundary = pending.indexOf("\n\n");
      if (boundary === -1) return;

      const frame = pending.slice(0, boundary + 2);
      pending = pending.slice(boundary + 2);
      emit(frame);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    pending += decoder.decode(value, { stream: true });
    flushCompleteFrames();
  }

  pending += decoder.decode();
  if (pending.trim()) {
    emit(pending.endsWith("\n\n") ? pending : `${pending}\n\n`);
  }
};
