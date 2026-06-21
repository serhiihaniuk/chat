import type { SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { Effect } from "effect";
import type { AuthContext } from "#domain/authority";

/**
 * Durable, append-only log of one assistant turn's browser stream events.
 *
 * This is the resumability source of truth: a reconnect or cancel can land on a
 * different instance than the one generating, so the log (not an in-memory
 * stream) is what every subscriber replays from. Core appends each emitted
 * `SidechatStreamEvent` here; the persistence adapter stamps the row, derives
 * the durable type/sequence, and signals subscribers on commit.
 *
 * Ordering and offsets follow one convention: the event `sequence` is dense and
 * gap-free per turn (`sidechat.started` is 0), and reads use
 * `after = <lastSeenSequence>` returning `sequence > after` ordered ascending.
 */
export type TurnEventLogPort = {
  /**
   * Append one stream event at its protocol sequence.
   *
   * Idempotent on `(assistantTurnId, sequence)`: re-appending the identical event
   * is a no-op, while a conflicting payload at the same sequence is a durable-log
   * corruption and fails. At most one terminal event is ever stored per turn.
   */
  readonly appendEvent: (input: {
    readonly authContext: AuthContext;
    readonly assistantTurnId: string;
    readonly event: SidechatStreamEvent;
  }) => Effect.Effect<void, unknown>;
  /**
   * Read the events after a sequence offset, ordered ascending.
   *
   * `after = -1` returns the whole stream from `sidechat.started`.
   */
  readonly readEventsAfter: (input: {
    readonly authContext: AuthContext;
    readonly assistantTurnId: string;
    readonly after: number;
  }) => Effect.Effect<readonly SidechatStreamEvent[], unknown>;
  /**
   * Highest stored sequence for the turn, or `undefined` when no events exist.
   *
   * Abnormal-terminal paths append the synthetic terminal at `maxSequence + 1`.
   */
  readonly maxSequence: (input: {
    readonly authContext: AuthContext;
    readonly assistantTurnId: string;
  }) => Effect.Effect<number | undefined, unknown>;
};
