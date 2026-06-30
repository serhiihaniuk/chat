import { isTerminalEvent, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { TurnEventLogPort } from "@side-chat/partner-ai-core";
import { Effect, Queue } from "effect";

import type {
  TurnEventDispatcher,
  TurnEventSubscription,
} from "#inbound/turn-stream/turn-event-dispatcher";

/**
 * Per-instance in-memory turn-event registry (connection-bound streaming).
 *
 * Replaces the durable `turn_events` log + Postgres NOTIFY fan-out with a single
 * object that is both the core {@link TurnEventLogPort} (core appends each emitted
 * event here) and the {@link TurnEventDispatcher} the SSE route subscribes to.
 * `appendEvent` writes an in-memory buffer and fans out to local subscribers
 * directly, so there is no log read, no notify, and no safety poll. The final
 * assistant message is still persisted by core (`completeAssistantTurn`); this
 * registry only carries the live stream, so a lost connection is recovered from
 * history, never replayed.
 *
 * A turn's buffer is dropped once it is terminal and has no live subscribers, so
 * memory tracks only in-flight and actively-watched turns.
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
    Effect.sync(() => {
      const turn = ensureTurn(turns, assistantTurnId);
      const lastSequence = turn.events.at(-1)?.sequence ?? -1;
      // Idempotent on sequence: core appends in dense order, so a replayed append
      // at an already-stored sequence is a no-op.
      if (event.sequence <= lastSequence) return;
      turn.events.push(event);
      for (const queue of turn.subscribers) Queue.offerUnsafe(queue, event);
      if (isTerminalEvent(event)) turn.terminal = true;
    });

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
  (input: { readonly assistantTurnId: string }): Promise<TurnEventSubscription> =>
    Effect.runPromise(
      Effect.gen(function* () {
        const queue = yield* Queue.dropping<SidechatStreamEvent>(SUBSCRIBER_QUEUE_CAPACITY);
        const turn = ensureTurn(turns, input.assistantTurnId);
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
    hasTurn: (assistantTurnId) => turns.has(assistantTurnId),
    hasSubscribers: (assistantTurnId) => (turns.get(assistantTurnId)?.subscribers.size ?? 0) > 0,
    shutdown: () => {
      turns.clear();
      return Promise.resolve();
    },
  };
};
