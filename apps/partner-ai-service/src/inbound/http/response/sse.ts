import { encodeSseEvent, type SidechatStreamEvent } from "@side-chat/chat-protocol";

export const sseResponse = (events: readonly SidechatStreamEvent[], requestId: string): Response =>
  new Response(events.map(encodeSseEvent).join(""), {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-request-id": requestId,
    },
  });

export const streamingSseResponse = ({
  events,
  requestId,
}: {
  readonly events: AsyncIterable<SidechatStreamEvent>;
  readonly requestId: string;
}): Response => {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of events) {
            controller.enqueue(encoder.encode(encodeSseEvent(event)));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        "x-request-id": requestId,
      },
    },
  );
};
