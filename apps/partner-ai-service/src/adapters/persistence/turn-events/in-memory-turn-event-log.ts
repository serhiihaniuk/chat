import { isDeepStrictEqual } from "node:util";
import { isTerminalEvent, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { TurnEventLogPort } from "@side-chat/partner-ai-core";
import { Effect, Queue } from "effect";

import type {
  TurnEventDispatcher,
  TurnEventSubscription,
} from "#inbound/turn-stream/turn-event-dispatcher";

/**
 * Keep one turn's events in memory for connection-bound streaming.
 *
 * Core appends to this registry, and the SSE route subscribes to it. A live
 * subscriber receives events directly; the stream also rereads the registry
 * occasionally in case a notification was missed.
 *
 * This is per service instance and is not durable. A reconnect can replay events
 * only while this instance still has the buffer. The assistant message itself is
 * persisted by core, so history remains the fallback when the buffer is gone.
 * Finished buffers without subscribers are swept when a later turn starts.
 */
export type InMemoryTurnEventLog = TurnEventLogPort &
  TurnEventDispatcher & {
    /**
     * Whether a live subscriber (connected client) is attached to the turn.
     *
     * Connection-bound UI tools use this: a host command can only run if a client
     * is streaming the turn to dispatch it, so no subscriber means an immediate
     * `no_connected_client` result instead of a hang.
     */
    readonly hasSubscribers: (assistantTurnId: string) => boolean;
  };

const SUBSCRIBER_QUEUE_CAPACITY = 256;

type RunningTurn = {
  readonly events: SidechatStreamEvent[];
  readonly subscribers: Set<Queue.Queue<SidechatStreamEvent>>;
  terminal: boolean;
};

type TurnRegistry = Map<string, RunningTurn>;

// Lazy GC: when a new turn starts, drop finished turns (terminal + no live
// subscribers) so memory tracks only in-flight and actively-watched turns.
const sweepFinishedTurns = (turns: TurnRegistry): void => {
  for (const [id, turn] of turns) {
    if (turn.terminal && turn.subscribers.size === 0) turns.delete(id);
  }
};

const ensureTurn = (turns: TurnRegistry, assistantTurnId: string): RunningTurn => {
  const existing = turns.get(assistantTurnId);
  if (existing) return existing;
  sweepFinishedTurns(turns);
  const created: RunningTurn = { events: [], subscribers: new Set(), terminal: false };
  turns.set(assistantTurnId, created);
  return created;
};

const appendEventTo =
  (turns: TurnRegistry): InMemoryTurnEventLog["appendEvent"] =>
  ({ assistantTurnId, event }) =>
    Effect.suspend(() => {
      const existingTurn = turns.get(assistantTurnId);
      if (!existingTurn && event.sequence !== 0) {
        return Effect.fail(denseSequenceError(assistantTurnId, event.sequence, 0));
      }
      const turn = existingTurn ?? ensureTurn(turns, assistantTurnId);
      const existingEvent = turn.events[event.sequence];
      if (existingEvent) {
        return sameProtocolEvent(existingEvent, event)
          ? Effect.void
          : Effect.fail(conflictingSequenceError(assistantTurnId, event.sequence));
      }
      // Terminal guard: once a terminal is recorded the turn's log is closed, so
      // a racing synthetic terminal (an interrupt landing just after `completed`)
      // is a no-op — the same exactly-one-terminal contract the durable log's
      // partial-unique index used to enforce. Finalization relies on this.
      if (turn.terminal) return Effect.void;
      const lastSequence = turn.events.at(-1)?.sequence ?? -1;
      const nextSequence = lastSequence + 1;
      if (event.sequence !== nextSequence) {
        return Effect.fail(denseSequenceError(assistantTurnId, event.sequence, nextSequence));
      }
      turn.events.push(event);
      for (const queue of turn.subscribers) Queue.offerUnsafe(queue, event);
      if (isTerminalEvent(event)) turn.terminal = true;
      return Effect.void;
    });

const sameProtocolEvent = (stored: SidechatStreamEvent, candidate: SidechatStreamEvent): boolean =>
  isDeepStrictEqual(stored, candidate);

const conflictingSequenceError = (assistantTurnId: string, sequence: number): Error =>
  new Error(`Turn ${assistantTurnId} sequence ${sequence} already contains a different event.`);

const denseSequenceError = (
  assistantTurnId: string,
  receivedSequence: number,
  nextSequence: number,
): Error =>
  new Error(
    `Turn ${assistantTurnId} sequence ${receivedSequence} must be the next dense sequence ${nextSequence}.`,
  );

const readEventsAfterFrom =
  (turns: TurnRegistry): InMemoryTurnEventLog["readEventsAfter"] =>
  ({ assistantTurnId, after }) =>
    Effect.sync(() => {
      const turn = turns.get(assistantTurnId);
      if (!turn) return [];
      return turn.events.filter((event) => event.sequence > after);
    });

const maxSequenceFrom =
  (turns: TurnRegistry): InMemoryTurnEventLog["maxSequence"] =>
  ({ assistantTurnId }) =>
    Effect.sync(() => turns.get(assistantTurnId)?.events.at(-1)?.sequence);

const subscribeTo =
  (turns: TurnRegistry) =>
  (input: { readonly assistantTurnId: string }): Promise<TurnEventSubscription | undefined> =>
    Effect.runPromise(
      Effect.gen(function* () {
        // Subscribing never creates an entry: only the owner registers a turn
        // (registerTurn / appendEvent), so a foreign or swept turn is a typed miss
        // instead of a permanent ghost entry that misleads hasSubscribers.
        const turn = turns.get(input.assistantTurnId);
        if (!turn) return undefined;
        const queue = yield* Queue.dropping<SidechatStreamEvent>(SUBSCRIBER_QUEUE_CAPACITY);
        turn.subscribers.add(queue);
        return {
          events: queue,
          release: () =>
            Effect.runPromise(
              Effect.gen(function* () {
                turn.subscribers.delete(queue);
                yield* Queue.shutdown(queue);
                // The finished-turn buffer is intentionally NOT dropped here: a late
                // re-subscribe can still replay it. sweepFinishedTurns reclaims it when
                // the next turn starts, which is the connection-bound "grace" window.
              }),
            ),
        } satisfies TurnEventSubscription;
      }),
    );

export const createInMemoryTurnEventLog = (): InMemoryTurnEventLog => {
  const turns: TurnRegistry = new Map();
  return {
    appendEvent: appendEventTo(turns),
    readEventsAfter: readEventsAfterFrom(turns),
    maxSequence: maxSequenceFrom(turns),
    subscribe: subscribeTo(turns),
    registerTurn: (assistantTurnId) => {
      ensureTurn(turns, assistantTurnId);
    },
    hasTurn: (assistantTurnId) => turns.has(assistantTurnId),
    hasSubscribers: (assistantTurnId) => (turns.get(assistantTurnId)?.subscribers.size ?? 0) > 0,
    shutdown: () => {
      // Shut the subscriber queues down too: a tail blocked on Queue.take must
      // settle instead of hanging past the registry's lifetime. The HTTP server
      // closes the sockets anyway; this makes the teardown self-contained.
      const queues = [...turns.values()].flatMap((turn) => [...turn.subscribers]);
      turns.clear();
      return Effect.runPromise(
        Effect.forEach(queues, (queue) => Queue.shutdown(queue), { discard: true }),
      ).then(() => undefined);
    },
  };
};
