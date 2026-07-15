import { encodeTurnActivitySseEvent } from "@side-chat/chat-protocol";
import { Stream } from "effect";
import { Hono } from "hono";

import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import { createActivitySubscriptionStream } from "#application/turn/activity/activity-subscription-stream";
import type { TurnActivityDispatcher } from "#application/turn/activity/turn-activity-dispatcher";

import type { AuthVariables } from "../auth-middleware.js";
import { HTTP_HEADERS, QUERY_HTTP_ROUTES } from "../http-contract.js";
import { withIdleSseKeepalive } from "../stream/keepalive.js";

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
} as const;

export function createActivityRoutes(dependencies: {
  readonly dispatcher: TurnActivityDispatcher;
  readonly queries: Pick<ConversationQueryStore, "listActiveTurns">;
  readonly keepaliveIntervalMs: number;
}): Hono<AuthVariables> {
  const app = new Hono<AuthVariables>();
  app.get(QUERY_HTTP_ROUTES.ACTIVITY, (context) => {
    const events = createActivitySubscriptionStream(
      dependencies.dispatcher,
      dependencies.queries,
      context.get("authContext"),
    );
    const encodedEvents = events.pipe(
      Stream.map((event) => encodeTurnActivitySseEvent(event)),
      Stream.encodeText,
    );
    const encoded: ReadableStream<Uint8Array> = Stream.toReadableStream(encodedEvents);
    const requestId = context.req.header(HTTP_HEADERS.REQUEST_ID) || crypto.randomUUID();
    return new Response(withIdleSseKeepalive(encoded, dependencies.keepaliveIntervalMs), {
      headers: { ...SSE_HEADERS, [HTTP_HEADERS.REQUEST_ID]: requestId },
    });
  });
  return app;
}
