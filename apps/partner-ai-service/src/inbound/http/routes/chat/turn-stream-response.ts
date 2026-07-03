import type { AuthContext, StreamChatPorts } from "@side-chat/partner-ai-core";

import type { TurnEventDispatcher } from "#inbound/turn-stream/turn-event-dispatcher";
import { createTurnSubscriptionStream } from "#inbound/turn-stream/turn-subscription-stream";
import { streamSseResponse } from "../../response/sse.js";

/** The subscription machinery both stream-opening routes share. */
export type TurnStreamDependencies = {
  readonly ports: StreamChatPorts;
  readonly dispatcher: TurnEventDispatcher;
  readonly safetyPollIntervalMs: number;
  readonly sseHeartbeatIntervalMs: number;
};

/**
 * Open the SSE response for one turn after ownership and replay are proven.
 *
 * Shared by `POST /chat/runs` (streams the turn it just started, `after = -1`)
 * and `GET /chat/turns/:id/stream` (same-instance resume from a cursor). The
 * subscription stream registers with the dispatcher, replays from `after`, tails
 * live events, and ends at the terminal; cancelling the response body releases
 * only this subscriber, never the generation fiber.
 */
export const openTurnEventStream = (
  dependencies: TurnStreamDependencies,
  subscription: {
    readonly assistantTurnId: string;
    readonly requestId: string;
    readonly authContext: AuthContext;
    readonly after: number;
    /** Serve the buffered replay and end without tailing (turn already terminal). */
    readonly replayOnly?: boolean;
  },
): Response => {
  const events = createTurnSubscriptionStream(
    {
      dispatcher: dependencies.dispatcher,
      ports: dependencies.ports,
      safetyPollIntervalMs: dependencies.safetyPollIntervalMs,
    },
    {
      assistantTurnId: subscription.assistantTurnId,
      authContext: subscription.authContext,
      after: subscription.after,
      replayOnly: subscription.replayOnly ?? false,
    },
  );
  return streamSseResponse(events, subscription.requestId, dependencies.sseHeartbeatIntervalMs);
};
