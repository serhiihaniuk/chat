import type { SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { Effect } from "effect";
import type { AuthContext } from "#domain/authority";

/**
 * Append-only store for one assistant turn's browser stream events.
 *
 * Source events come from core; the target adapter chooses the storage
 * technology. The shipped target is a per-instance in-memory registry, so
 * replay is available only on that instance while the entry is retained. This
 * port hides the adapter but does not promise cross-instance or restart replay.
 *
 * Invariant: event sequences are dense per turn (`sidechat.started` is 0).
 * Reads use `after = <lastSeenSequence>` and return `sequence > after` in
 * ascending order.
 */
export type TurnEventLogPort = {
  /**
   * Append one stream event at its protocol sequence.
   *
   * Invariant: `(assistantTurnId, sequence)` is idempotent only for an identical
   * event; a conflicting payload fails. Once the target stores a terminal,
   * later appends are no-ops, so each turn stores at most one terminal.
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
