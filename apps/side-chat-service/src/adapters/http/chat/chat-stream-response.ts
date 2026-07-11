import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";

import {
  TURN_FINISH_REASONS,
  TURN_OUTPUT_EVENT_TYPES,
  type TurnOutputEvent,
} from "#domain/turn/turn";

import { withIdleSseKeepalive } from "../stream/keepalive.js";
import { HTTP_HEADERS } from "../http-contract.js";

export type OutboundTransform = TransformStream<UIMessageChunk, UIMessageChunk>;

/** Encode the SDK stream once, then add byte-level idle comments at the HTTP edge. */
export function createChatStreamResponse(options: {
  readonly stream: ReadableStream<TurnOutputEvent>;
  readonly runId: string;
  readonly keepaliveIntervalMs: number;
  readonly outboundTransforms?: readonly OutboundTransform[];
}): Response {
  const uiMessageStream = options.stream.pipeThrough(toUiMessageChunks());
  const transformed = pipeOutboundTransforms(uiMessageStream, options.outboundTransforms ?? []);
  const response = createUIMessageStreamResponse({
    stream: transformed,
    headers: { [HTTP_HEADERS.WORKFLOW_RUN_ID]: options.runId },
  });
  if (!response.body) return response;
  return new Response(withIdleSseKeepalive(response.body, options.keepaliveIntervalMs), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function toUiMessageChunks(): TransformStream<TurnOutputEvent, UIMessageChunk> {
  return new TransformStream({
    transform(event, controller) {
      controller.enqueue(toUiMessageChunk(event));
    },
  });
}

function toUiMessageChunk(event: TurnOutputEvent): UIMessageChunk {
  switch (event.type) {
    case TURN_OUTPUT_EVENT_TYPES.START:
      return { type: "start", messageId: event.messageId };
    case TURN_OUTPUT_EVENT_TYPES.TEXT_START:
      return { type: "text-start", id: event.textId };
    case TURN_OUTPUT_EVENT_TYPES.TEXT_DELTA:
      return { type: "text-delta", id: event.textId, delta: event.delta };
    case TURN_OUTPUT_EVENT_TYPES.TEXT_END:
      return { type: "text-end", id: event.textId };
    case TURN_OUTPUT_EVENT_TYPES.ERROR:
      return { type: "error", errorText: event.errorCode };
    case TURN_OUTPUT_EVENT_TYPES.ABORT:
      return { type: "abort" };
    case TURN_OUTPUT_EVENT_TYPES.FINISH:
      return { type: "finish", finishReason: TURN_FINISH_REASONS.STOP };
  }
}

function pipeOutboundTransforms(
  source: ReadableStream<UIMessageChunk>,
  transforms: readonly OutboundTransform[],
): ReadableStream<UIMessageChunk> {
  let stream = source;
  for (const transform of transforms) stream = stream.pipeThrough(transform);
  return stream;
}
