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
 * Fan out live turn events to SSE subscribers on this service instance.
 *
 * A turn in the registry is live or recently finished, so subscribers can replay
 * its buffer and receive new events. When the entry is swept, replay expires and
 * the client reads the final answer from conversation history.
 */
export type TurnEventDispatcher = {
  /**
   * Register before reading the replay buffer.
   *
   * From registration onward, the subscriber receives new events. The caller can
   * then replay the buffer and drain the queue without a gap. Registration never
   * creates a turn entry; an unknown or swept turn returns `undefined`.
   */
  readonly subscribe: (input: {
    readonly assistantTurnId: string;
    readonly authContext: AuthContext;
  }) => Promise<TurnEventSubscription | undefined>;
  /**
   * Create the turn's registry entry the moment this instance accepts the turn.
   *
   * Only the owner calls this (idempotently), before its POST response
   * subscribes — the generation fiber's first append may still be in flight, and
   * without the entry that subscribe would miss. Readers never register turns.
   */
  readonly registerTurn: (assistantTurnId: string) => void;
  /** Whether the turn is still tracked in the registry (live or recently buffered). */
  readonly hasTurn: (assistantTurnId: string) => boolean;
  /** Release the registry resources (shutdown). */
  readonly shutdown: () => Promise<void>;
};
