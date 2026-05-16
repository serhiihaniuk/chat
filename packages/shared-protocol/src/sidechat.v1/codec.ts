import { SidechatProtocolVersion } from "./types.js";
import type {
  SidechatStreamEvent,
  SidechatStreamErrorEvent,
  SidechatStreamCompletedEvent,
  SidechatStreamStartEvent,
  SidechatStreamDeltaEvent,
  SidechatStreamReasoningEvent,
  SidechatStreamToolEvent,
  SidechatStreamHostCommandEvent,
  SidechatStreamHistoryEvent,
} from "./types.js";
import { validateStreamEvent } from "./validation.js";

/**
 * The codec owns only Server-Sent Events framing. It deliberately does not know
 * about Hono, fetch, React state, or model providers.
 */
export const protocolLinePrefix = "data:";

const startsWithPrefix = (line: string): boolean =>
  line.startsWith(`${protocolLinePrefix} `);

export const encodeSseEvent = (event: SidechatStreamEvent): string => {
  const payload = JSON.stringify(event);
  return `${protocolLinePrefix} ${payload}`;
};

export const parseSseEvent = (
  line: string,
): SidechatStreamEvent | undefined => {
  if (!startsWithPrefix(line)) return undefined;

  const json = line.slice(protocolLinePrefix.length + 1).trimStart();
  if (!json) return undefined;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(json);
  } catch {
    return undefined;
  }

  const parsed = validateStreamEvent(parsedJson);
  if (!parsed.ok) return undefined;

  return parsed.data;
};

export const isTerminalSidechatEvent = (
  event: SidechatStreamEvent,
): event is SidechatStreamCompletedEvent | SidechatStreamErrorEvent => {
  return event.type === "sidechat.completed" || event.type === "sidechat.error";
};

export const isDeltaSidechatEvent = (
  event: SidechatStreamEvent,
): event is SidechatStreamDeltaEvent => {
  return event.type === "sidechat.delta";
};

export const isReasoningSidechatEvent = (
  event: SidechatStreamEvent,
): event is SidechatStreamReasoningEvent => {
  return event.type === "sidechat.reasoning";
};

export const isToolSidechatEvent = (
  event: SidechatStreamEvent,
): event is SidechatStreamToolEvent => {
  return event.type === "sidechat.tool";
};

export const isHostCommandSidechatEvent = (
  event: SidechatStreamEvent,
): event is SidechatStreamHostCommandEvent => {
  return event.type === "sidechat.host_command";
};

export const isHistorySidechatEvent = (
  event: SidechatStreamEvent,
): event is SidechatStreamHistoryEvent => {
  return event.type === "sidechat.history";
};

export const isStartedSidechatEvent = (
  event: SidechatStreamEvent,
): event is SidechatStreamStartEvent => {
  return event.type === "sidechat.started";
};

export const protocolFrame = {
  protocol: SidechatProtocolVersion,
  headers: {
    protocol: "X-Sidechat-Protocol",
    requestId: "X-Request-Id",
  },
} as const;

/**
 * Writes one complete SSE frame. The `event:` line lets browsers and tests know
 * the product event type before decoding the JSON `data:` line.
 */
export const encodeSseFrame = (event: SidechatStreamEvent): string =>
  [`event: ${event.type}`, encodeSseEvent(event), ""].join("\n");

export interface ParsedSsePayload {
  event?: string;
  data: string;
}

/**
 * Parses raw text/event-stream chunks into payloads. It handles framing only;
 * validation happens later through sidechat.v1 schemas.
 */
export const parseSsePayload = (chunk: string): ParsedSsePayload[] => {
  const blocks = chunk.split("\n\n");
  const out: ParsedSsePayload[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const lines = trimmed.split("\n");
    const payload: ParsedSsePayload = { data: "" };

    for (const line of lines) {
      if (!line || line.startsWith(":")) {
        continue;
      }

      if (line.startsWith("event:")) {
        payload.event = line.slice("event:".length).trim();
        continue;
      }

      if (line.startsWith("data:")) {
        payload.data = payload.data
          ? `${payload.data}\n${line.slice("data:".length).trimStart()}`
          : line.slice("data:".length).trimStart();
        continue;
      }
    }

    if (payload.data) {
      out.push(payload);
    }
  }

  return out;
};

/**
 * Browser/test convenience helper: ignore unknown event names and decode only
 * known sidechat.v1 payloads into typed stream events.
 */
export const parseKnownSsePayloads = (chunk: string): SidechatStreamEvent[] => {
  const payloads = parseSsePayload(chunk);
  const out: SidechatStreamEvent[] = [];

  for (const payload of payloads) {
    if (
      payload.event &&
      payload.event !== "sidechat.started" &&
      payload.event !== "sidechat.delta" &&
      payload.event !== "sidechat.reasoning" &&
      payload.event !== "sidechat.tool" &&
      payload.event !== "sidechat.host_command" &&
      payload.event !== "sidechat.completed" &&
      payload.event !== "sidechat.error" &&
      payload.event !== "sidechat.history"
    ) {
      continue;
    }

    const parsed = parseSseEvent(`${protocolLinePrefix} ${payload.data}`);
    if (parsed) {
      out.push(parsed);
    }
  }

  return out;
};
