import {
  encodeSseEvent,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";

export const sseResponse = (
  events: readonly SidechatStreamEvent[],
  requestId: string,
): Response =>
  new Response(events.map(encodeSseEvent).join(""), {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-request-id": requestId,
    },
  });
