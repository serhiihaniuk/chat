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
 * Run one assistant turn independently of the HTTP connection.
 *
 * The service starts this Effect in a server-owned fiber. It writes each
 * browser event to the turn-event store while generation runs, then finalizes
 * the durable turn when the fiber exits.
 *
 * The owner lease can interrupt generation when another instance takes over.
 * The lease and the finalizer are inside the same `onExit` scope, so even an
 * interrupt during lease acquisition still produces the required terminal
 * event and final status.
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
