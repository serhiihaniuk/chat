import { Effect, Schedule } from "effect";
import { STREAM_CHAT_FAILURES, mapPortFailure, type PartnerAiCoreError } from "#errors";
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
 * Run generation while this service instance owns the turn lease.
 *
 * First, try to claim the lease. If another owner already has it, generation
 * still runs as a safe backstop, but this instance does not start a heartbeat.
 * If the claim succeeds, generation races the heartbeat. Losing the lease
 * interrupts generation so an old owner cannot keep writing after takeover.
 *
 * This function stays inside `runTurnGeneration`'s `onExit`. That lets the
 * finalizer handle every stop, including an interrupt during lease acquisition.
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
 * Renew the lease until the owner is fenced.
 *
 * A transient database error gets a few quick retries. A successful renewal
 * with `renewed: false` means another owner or the reaper took the lease, so
 * this function interrupts generation immediately.
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
