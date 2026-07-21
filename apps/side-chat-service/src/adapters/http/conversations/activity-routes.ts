import { Hono } from "hono";
import {
  TURN_ACTIVITY_EVENT_TYPE,
  TURN_ACTIVITY_STATUS,
  TURN_ACTIVITY_SYNC_EVENT_TYPE,
  type TurnActivityStreamEvent,
} from "@side-chat/stream-profile";

import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import type { TelemetrySink } from "#application/ports/telemetry-sink";
import { recordTelemetrySafely } from "#application/telemetry/record-telemetry-safely";
import { createActivitySubscriptionStream } from "#application/turn/activity/activity-subscription-stream";
import type { TurnActivityDispatcher } from "#application/turn/activity/turn-activity-dispatcher";
import { TURN_ACTIVITY_KIND, type TurnActivity } from "#domain/turn-activity";

import type { AuthVariables } from "../auth-middleware.js";
import { HTTP_HEADERS, QUERY_HTTP_ROUTES } from "../http-contract.js";
import { withIdleSseKeepalive } from "../stream/keepalive.js";
import type { ActiveStreamRegistry } from "../stream/active-stream-registry.js";

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
  readonly telemetry: Pick<TelemetrySink, "record">;
  readonly activeStreams?: ActiveStreamRegistry | undefined;
}): Hono<AuthVariables> {
  const app = new Hono<AuthVariables>();
  app.get(QUERY_HTTP_ROUTES.ACTIVITY, (context) => {
    const events = createActivitySubscriptionStream(
      dependencies.dispatcher,
      dependencies.queries,
      context.get("authContext"),
    );
    const encoded = encodeActivityEvents(events);
    const requestId = context.req.header(HTTP_HEADERS.REQUEST_ID) || crypto.randomUUID();
    const bytes = withIdleSseKeepalive(encoded, dependencies.keepaliveIntervalMs, {
      onKeepalive: () => recordKeepalive(dependencies.telemetry),
    });
    return new Response(dependencies.activeStreams?.track(bytes) ?? bytes, {
      headers: { ...SSE_HEADERS, [HTTP_HEADERS.REQUEST_ID]: requestId },
    });
  });
  return app;
}

function recordKeepalive(telemetry: Pick<TelemetrySink, "record">): void {
  recordTelemetrySafely(telemetry, {
    type: "stream.keepalive",
    labels: { operation: "activity_stream" },
    count: 1,
  });
}

function encodeActivityEvents(events: ReadableStream<TurnActivity>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return events.pipeThrough(
    new TransformStream({
      transform: (event, controller) => {
        controller.enqueue(
          encoder.encode(encodeTurnActivitySseEvent(toTurnActivityWireEvent(event))),
        );
      },
    }),
  );
}

export function toTurnActivityWireEvent(event: TurnActivity): TurnActivityStreamEvent {
  if (event.kind === TURN_ACTIVITY_KIND.SNAPSHOT) {
    return {
      type: TURN_ACTIVITY_SYNC_EVENT_TYPE,
      activeTurns: event.activeTurns,
    };
  }
  return {
    type: TURN_ACTIVITY_EVENT_TYPE,
    conversationId: event.conversationId,
    assistantTurnId: event.assistantTurnId,
    status: event.running ? TURN_ACTIVITY_STATUS.RUNNING : TURN_ACTIVITY_STATUS.TERMINAL,
  };
}

const encodeTurnActivitySseEvent = (event: TurnActivityStreamEvent): string =>
  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
