import type { SidechatStreamEvent } from "@side-chat/chat-protocol";
import { Effect, Ref, Stream } from "effect";
import { STREAM_CHAT_FAILURES, mapPortFailure, type PartnerAiCoreError } from "#errors";
import { finalizeTurnGeneration } from "./finalization/finalize-turn-generation.js";
import { recordProtocolEvent } from "./finalization/protocol-event-accumulator.js";
import {
  createProtocolStreamRefs,
  createStartedProtocolStream,
  type ProtocolStreamRefs,
} from "./protocol-event-stream.js";
import { drainUnderOwnerLease, type TurnLeaseSettings } from "./lease/turn-lease-heartbeat.js";
import type {
  PreparedStreamChatTurn,
  StreamChatInput,
  StreamChatPorts,
} from "../stream-chat-types.js";

export type { TurnLeaseSettings } from "./lease/turn-lease-heartbeat.js";

/**
 * Run one prepared assistant turn to a durable final status, socket-independent.
 *
 * This is the core half of the server-owned runner: the service forks this
 * Effect into its own scope (never the HTTP request) and the turn then runs to
 * completion regardless of whether any browser is connected. Each post-start
 * `SidechatStreamEvent` is appended to the turn-event port as it is emitted. The
 * shipped service stores those events in its per-instance registry and signals
 * same-instance subscribers on append.
 *
 * Finalization is owned here through `Effect.onExit` so it runs on success,
 * provider error, user-interrupt, shutdown, and lease-fence alike:
 * - a normal terminal was emitted by the stream and appended by the drain, so
 *   finalize only writes the durable assistant-turn status;
 * - an abnormal exit appends the one synthetic terminal that path owns.
 *
 * The drain runs under an owner lease: the fiber claims ownership, heartbeats it,
 * and self-interrupts if fenced — and because the lease logic sits *inside* this
 * `onExit`, even an interrupt during lease acquisition still finalizes the turn.
 *
 * The result is the invariant the plan requires: exactly one terminal event and
 * exactly one durable status transition across every exit path.
 */
export const runTurnGeneration = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  lease: TurnLeaseSettings,
): Effect.Effect<void, PartnerAiCoreError> =>
  Effect.gen(function* () {
    // The drain records only successfully appended events in the accumulator;
    // the finalizer reads those same committed facts on every exit path.
    const refs = yield* createProtocolStreamRefs(ports, input, turn);
    return yield* Effect.onExit(
      drainUnderOwnerLease(ports, lease, turn, drainPostStartToEventLog(refs)),
      (exit) => finalizeTurnGeneration(ports, input, turn, refs.accumulator, exit),
    );
  });

/**
 * Drain the post-start protocol stream into the turn event log.
 *
 * Source events come from the protocol stream; the turn-event port is the
 * target. Each append and accumulator update form one uninterruptible boundary.
 * Invariant: finalization never trusts a terminal the target did not receive.
 * An append failure becomes a typed core error, so the abnormal path attempts
 * its synthetic terminal instead of silently losing the turn.
 */
const drainPostStartToEventLog = (
  refs: ProtocolStreamRefs,
): Effect.Effect<void, PartnerAiCoreError> =>
  Stream.runForEach(createStartedProtocolStream(refs), (event) => appendStreamEvent(refs, event));

const appendStreamEvent = (
  refs: ProtocolStreamRefs,
  event: SidechatStreamEvent,
): Effect.Effect<void, PartnerAiCoreError> =>
  Effect.uninterruptible(
    mapPortFailure(
      refs.ports.turnEventLog.appendEvent({
        authContext: refs.turn.authContext,
        assistantTurnId: refs.turn.assistantTurnId,
        event,
      }),
      STREAM_CHAT_FAILURES.PERSISTENCE,
    ).pipe(
      Effect.andThen(
        Ref.update(refs.accumulator, (current) => recordProtocolEvent(current, event)),
      ),
    ),
  );
