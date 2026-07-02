import { Effect, Schedule } from "effect";
import type { PartnerAiCoreError } from "#errors";
import { STREAM_CHAT_FAILURES, mapPortFailure } from "../../errors/effect-failures.js";
import type { PreparedStreamChatTurn, StreamChatPorts } from "../../stream-chat-types.js";

/**
 * Resolved owner-lease tunables the service threads in from config.
 *
 * `instanceId` is the lease owner identity written to the durable record;
 * `leaseTtlMs` is the lease window; `heartbeatIntervalMs` is the renew cadence,
 * kept under the window so a live owner renews several times before expiry.
 */
export type TurnLeaseSettings = {
  readonly instanceId: string;
  readonly leaseTtlMs: number;
  readonly heartbeatIntervalMs: number;
};

/**
 * Run the generation drain under an owner lease, fencing it if the lease is lost.
 *
 * This is the fencing half of the server-owned runner (resumable-streaming plan,
 * "Lease Fencing"). It must stay *inside* `runTurnGeneration`'s `onExit`, so the
 * abnormal finalizer owns every exit — including an interrupt that lands during
 * `acquireTurnLease` before the drain even starts.
 *
 * - It claims the lease first so the reaper cannot terminalize a turn with a live
 *   owner. A failed claim (the turn is already terminal/owned) skips the heartbeat
 *   and just drains; the reaper is the backstop.
 * - It then races the drain against a heartbeat. If the drain ends, the heartbeat
 *   is interrupted with it. If a renew reports `renewed: false`, this owner was
 *   fenced (the reaper or a new owner bumped the epoch), so the heartbeat
 *   self-interrupts and `Effect.raceFirst` interrupts the drain. That interrupt
 *   without cancel intent is what the finalizer records as a non-user
 *   `provider_failed`, so a fenced owner stops without double-writing the turn.
 */
export const drainUnderOwnerLease = (
  ports: StreamChatPorts,
  lease: TurnLeaseSettings,
  turn: PreparedStreamChatTurn,
  drain: Effect.Effect<void, PartnerAiCoreError>,
): Effect.Effect<void, PartnerAiCoreError> =>
  Effect.gen(function* () {
    const claim = yield* acquireOwnerLease(ports, lease, turn);
    if (!claim.acquired) return yield* drain;

    return yield* Effect.raceFirst(
      drain,
      heartbeatUntilFenced(ports, lease, turn, claim.leaseEpoch),
    );
  });

const acquireOwnerLease = (
  ports: StreamChatPorts,
  lease: TurnLeaseSettings,
  turn: PreparedStreamChatTurn,
): Effect.Effect<{ readonly acquired: boolean; readonly leaseEpoch: number }, PartnerAiCoreError> =>
  mapPortFailure(
    ports.assistantTurns.acquireTurnLease({
      authContext: turn.authContext,
      assistantTurnId: turn.assistantTurnId,
      ownerInstanceId: lease.instanceId,
      leaseTtlMs: lease.leaseTtlMs,
      now: ports.clock.now(),
    }),
    STREAM_CHAT_FAILURES.PERSISTENCE,
  );

/**
 * Extra renew attempts after a transient persistence failure, before the
 * heartbeat gives up and lets the failure interrupt a healthy generation.
 */
const RENEW_RETRY_ATTEMPTS = 2;

/** Base backoff between renew retries; short, because the lease window is ticking. */
const RENEW_RETRY_BASE_MS = 200;

/**
 * Renew the lease on a fixed cadence until it is lost, then self-interrupt.
 *
 * Sleeping before the first renew gives the lease its full window before the
 * first heartbeat. A lost renew ends the loop with `Effect.interrupt`, which is
 * what fences the raced drain. A renew that *fails* (a DB blip, not a fence) is
 * retried with a short backoff first, so one transient persistence error cannot
 * kill a healthy turn — only a renew that succeeds with `renewed: false` still
 * fences immediately.
 */
const heartbeatUntilFenced = (
  ports: StreamChatPorts,
  lease: TurnLeaseSettings,
  turn: PreparedStreamChatTurn,
  leaseEpoch: number,
): Effect.Effect<never, PartnerAiCoreError> =>
  Effect.gen(function* () {
    yield* Effect.sleep(lease.heartbeatIntervalMs);
    const { renewed } = yield* Effect.retry(renewOwnerLease(ports, lease, turn, leaseEpoch), {
      times: RENEW_RETRY_ATTEMPTS,
      schedule: Schedule.exponential(RENEW_RETRY_BASE_MS),
    });
    if (!renewed) return yield* Effect.interrupt;
    return yield* heartbeatUntilFenced(ports, lease, turn, leaseEpoch);
  });

const renewOwnerLease = (
  ports: StreamChatPorts,
  lease: TurnLeaseSettings,
  turn: PreparedStreamChatTurn,
  leaseEpoch: number,
): Effect.Effect<{ readonly renewed: boolean }, PartnerAiCoreError> =>
  mapPortFailure(
    ports.assistantTurns.renewTurnLease({
      authContext: turn.authContext,
      assistantTurnId: turn.assistantTurnId,
      ownerInstanceId: lease.instanceId,
      leaseEpoch,
      leaseTtlMs: lease.leaseTtlMs,
      now: ports.clock.now(),
    }),
    STREAM_CHAT_FAILURES.PERSISTENCE,
  );
