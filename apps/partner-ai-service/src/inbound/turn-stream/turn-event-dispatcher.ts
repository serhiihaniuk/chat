import type { AuthContext } from "@side-chat/partner-ai-core";
import type { SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { Queue } from "effect";

/**
 * One subscriber's live feed into the subscription stream.
 *
 * `events` is a dropping queue of events fanned out to the subscriber after it
 * registered; `release` removes the subscriber from its turn's fan-out.
 */
export type TurnEventSubscription = {
  readonly events: Queue.Dequeue<SidechatStreamEvent>;
  readonly release: () => Promise<void>;
};

/**
 * Per-instance fan-out of live turn events to local SSE subscribers
 * (connection-bound streaming).
 *
 * Backed by the in-memory running-turn registry: a turn present in the registry
 * is live (or recently finished and still buffered), so a subscriber replays its
 * buffer and tails new events. A turn absent from the registry has finished and
 * been garbage-collected, so the route returns `replay_expired` and the client
 * reads the final answer from conversation history — there is no durable replay.
 */
export type TurnEventDispatcher = {
  /**
   * Register a subscriber for one turn before any replay read.
   *
   * Registering first is the missed-event guard: from this point the subscriber
   * receives every fanned-out event, so a caller can replay the buffer and then
   * drain this queue without a gap.
   */
  readonly subscribe: (input: {
    readonly assistantTurnId: string;
    readonly authContext: AuthContext;
  }) => Promise<TurnEventSubscription>;
  /** Whether the turn is still tracked in the registry (live or recently buffered). */
  readonly hasTurn: (assistantTurnId: string) => boolean;
  /** Release the registry resources (shutdown). */
  readonly shutdown: () => Promise<void>;
};
