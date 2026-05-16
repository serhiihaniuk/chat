import { Effect } from "effect";
import { encodeSseFrame } from "@side-chat/shared-protocol";

import { runEffectBoundary } from "#application/effect-boundary.js";
import {
  streamChatEffect,
  type StreamChatDeps,
} from "#application/stream-chat.js";
import { toProtocolError } from "./protocol-errors.js";

/**
 * Outbound HTTP adapter. It turns the application async event stream into
 * text/event-stream bytes and guarantees protocol errors are still streamed.
 */
export const streamEvents = (
  deps: StreamChatDeps,
  body: unknown,
  requestId: string,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        await runEffectBoundary(
          Effect.tryPromise({
            try: () =>
              deps.observability.span("sidechat.stream", async () => {
                const events = await Effect.runPromise(
                  streamChatEffect(deps, { requestId, body, signal }),
                );
                for await (const event of events) {
                  controller.enqueue(
                    encoder.encode(`${encodeSseFrame(event)}\n`),
                  );
                }
              }),
            catch: (error) => error,
          }),
        );
      } catch (error) {
        const protocolError = toProtocolError(requestId, error);
        deps.observability.lifecycle(protocolError);
        deps.observability.counter("sidechat.stream.error", {
          code: protocolError.code,
        });
        controller.enqueue(
          encoder.encode(`${encodeSseFrame(protocolError)}\n`),
        );
      } finally {
        controller.close();
      }
    },
  });
};
