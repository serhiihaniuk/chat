import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";

import { withIdleSseKeepalive } from "../stream/keepalive.js";
import { HTTP_HEADERS } from "../http-contract.js";

/** One stage of outbound policy over the wire stream. Single-use — see {@link OutboundTransformFactory}. */
export type OutboundTransform = TransformStream<UIMessageChunk, UIMessageChunk>;

/**
 * Builds a fresh {@link OutboundTransform} per request. A `TransformStream` is
 * single-use, so the outbound seam holds factories, not shared instances; this is
 * also where `data-*` injection composes with the scrub filter, ordered relative
 * to native parts.
 */
export type OutboundTransformFactory = () => OutboundTransform;

/**
 * Encode a turn's UI message stream as the Server-Sent Events HTTP response.
 *
 * The engine stream is encoded once, outbound policy is applied through the
 * transforms, and byte-level keepalive comments are added last — at the HTTP edge,
 * after encoding — so they never disturb chunk decoding. The response advertises
 * the `x-vercel-ai-ui-message-stream: v1` protocol via the SDK encoder.
 *
 * @param options.stream - The turn's native `UIMessageChunk` stream. Consumed once.
 * @param options.runId - Durable run id, returned as the `x-workflow-run-id`
 *   response header so a dropped client can reconnect and replay.
 * @param options.keepaliveIntervalMs - Idle timeout in milliseconds after which a
 *   comment frame is emitted to stop proxies closing a quiet stream. The timer
 *   resets on every real chunk, so an actively streaming turn carries no keepalives.
 * @param options.outboundTransforms - Per-request transform factories, applied in
 *   array order before encoding; each is invoked once per response. Defaults to
 *   none. The scrub filter and any `data-*` injection compose here.
 */
export function createChatStreamResponse(options: {
  readonly stream: ReadableStream<UIMessageChunk>;
  readonly runId: string;
  readonly keepaliveIntervalMs: number;
  readonly outboundTransforms?: readonly OutboundTransformFactory[];
}): Response {
  const transformed = pipeOutboundTransforms(options.stream, options.outboundTransforms ?? []);
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

function pipeOutboundTransforms(
  source: ReadableStream<UIMessageChunk>,
  factories: readonly OutboundTransformFactory[],
): ReadableStream<UIMessageChunk> {
  let stream = source;
  for (const create of factories) stream = stream.pipeThrough(create());
  return stream;
}
