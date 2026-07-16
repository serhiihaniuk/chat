import type {
  TurnAdmission,
  TurnAdmissionLease,
  TurnAdmissionOptions,
} from "#application/ports/turn/turn-admission";
import type { TelemetrySink } from "#application/ports/telemetry-sink";
import { recordTelemetrySafely } from "#application/telemetry/record-telemetry-safely";
import {
  abortError,
  capacityError,
  drainingError,
  requireNonNegativeInteger,
  requirePositiveInteger,
} from "./bounded-turn-admission-support.js";

export const TURN_ADMISSION_RELEASE_MODES = {
  IDEMPOTENT: "idempotent",
  STRICT: "strict",
} as const;

export type TurnAdmissionReleaseMode =
  (typeof TURN_ADMISSION_RELEASE_MODES)[keyof typeof TURN_ADMISSION_RELEASE_MODES];

export type TurnAdmissionSnapshot = Readonly<{
  admitted: number;
  queued: number;
  rejected: number;
  cancelledWhileQueued: number;
  active: number;
  queueWaitDurationMs: number;
  duplicateReleases: number;
}>;

export interface TurnAdmissionTimer {
  cancel(): void;
}

export interface TurnAdmissionClock {
  now(): number;
  schedule(delayMs: number, task: () => void): TurnAdmissionTimer;
}

export type BoundedTurnAdmissionOptions = Readonly<{
  maxActiveTurns: number;
  queueSize: number;
  queueTimeoutMs: number;
  clock?: TurnAdmissionClock | undefined;
  releaseMode?: TurnAdmissionReleaseMode | undefined;
  telemetry?: Pick<TelemetrySink, "record"> | undefined;
}>;

type MutableAdmissionCounters = {
  admitted: number;
  queued: number;
  rejected: number;
  cancelledWhileQueued: number;
  active: number;
  queueWaitDurationMs: number;
  duplicateReleases: number;
};

type QueuedTurn = {
  readonly enqueuedAt: number;
  readonly resolve: (lease: TurnAdmissionLease) => void;
  readonly reject: (error: Error) => void;
  readonly signal: AbortSignal | undefined;
  timer: TurnAdmissionTimer | undefined;
  abortListener: (() => void) | undefined;
  settled: boolean;
};

const SYSTEM_TURN_ADMISSION_CLOCK: TurnAdmissionClock = {
  now: () => Date.now(),
  schedule: (delayMs, task) => {
    const timer = setTimeout(task, delayMs);
    return { cancel: () => clearTimeout(timer) };
  },
};

export class DuplicateTurnAdmissionReleaseError extends Error {
  readonly code = "turn_admission_duplicate_release";

  constructor() {
    super("Turn admission lease was released more than once");
    this.name = "DuplicateTurnAdmissionReleaseError";
  }
}

/**
 * Bounds active turns in one process and exposes cumulative counters for the
 * later telemetry adapter. Queue waits are FIFO and use an injected clock so
 * timeout, cancellation, and counter behavior remain deterministic in tests.
 */
export class BoundedTurnAdmission implements TurnAdmission {
  readonly #maxActiveTurns: number;
  readonly #queueSize: number;
  readonly #queueTimeoutMs: number;
  readonly #clock: TurnAdmissionClock;
  readonly #releaseMode: TurnAdmissionReleaseMode;
  readonly #telemetry: Pick<TelemetrySink, "record">;
  readonly #queue: QueuedTurn[] = [];
  readonly #idleWaiters = new Set<() => void>();
  #accepting = true;
  readonly #counters: MutableAdmissionCounters = {
    admitted: 0,
    queued: 0,
    rejected: 0,
    cancelledWhileQueued: 0,
    active: 0,
    queueWaitDurationMs: 0,
    duplicateReleases: 0,
  };

  constructor(options: BoundedTurnAdmissionOptions) {
    requirePositiveInteger(options.maxActiveTurns, "maxActiveTurns");
    requireNonNegativeInteger(options.queueSize, "queueSize");
    requirePositiveInteger(options.queueTimeoutMs, "queueTimeoutMs");
    this.#maxActiveTurns = options.maxActiveTurns;
    this.#queueSize = options.queueSize;
    this.#queueTimeoutMs = options.queueTimeoutMs;
    this.#clock = options.clock ?? SYSTEM_TURN_ADMISSION_CLOCK;
    this.#releaseMode = options.releaseMode ?? TURN_ADMISSION_RELEASE_MODES.IDEMPOTENT;
    this.#telemetry = options.telemetry ?? { record: () => undefined };
  }

  admitTurn(
    _conversationId: string,
    options: TurnAdmissionOptions = {},
  ): Promise<TurnAdmissionLease> {
    if (options.signal?.aborted === true) return Promise.reject(abortError(options.signal));
    if (!this.#accepting) return this.#rejectDraining();
    if (this.#counters.active < this.#maxActiveTurns) {
      return Promise.resolve(this.#grantLease());
    }
    if (this.#queue.length >= this.#queueSize) {
      this.#counters.rejected += 1;
      this.#record({ type: "capacity.rejected", count: 1 });
      return Promise.reject(capacityError());
    }
    return this.#enqueue(options.signal);
  }

  snapshot(): TurnAdmissionSnapshot {
    return { ...this.#counters };
  }

  /** Reject new and queued work while already admitted turns finish. */
  stopAccepting(): void {
    if (!this.#accepting) return;
    this.#accepting = false;
    for (const waiter of this.#queue.splice(0)) {
      if (waiter.settled) continue;
      this.#counters.rejected += 1;
      this.#record({ type: "capacity.rejected", count: 1 });
      this.#settleQueued(waiter);
      waiter.reject(drainingError());
    }
    this.#resolveIdleWaiters();
  }

  whenIdle(): Promise<void> {
    if (this.#counters.active === 0) return Promise.resolve();
    return new Promise((resolve) => this.#idleWaiters.add(resolve));
  }

  #enqueue(signal: AbortSignal | undefined): Promise<TurnAdmissionLease> {
    this.#counters.queued += 1;
    this.#record({ type: "capacity.queued", count: 1 });
    return new Promise((resolve, reject) => {
      const waiter: QueuedTurn = {
        enqueuedAt: this.#clock.now(),
        resolve,
        reject,
        signal,
        timer: undefined,
        abortListener: undefined,
        settled: false,
      };
      waiter.timer = this.#clock.schedule(this.#queueTimeoutMs, () => this.#rejectTimedOut(waiter));
      if (signal !== undefined) {
        const abortListener = () => this.#cancelQueued(waiter);
        waiter.abortListener = abortListener;
        signal.addEventListener("abort", abortListener, { once: true });
      }
      this.#queue.push(waiter);
    });
  }

  #grantLease(): TurnAdmissionLease {
    this.#counters.active += 1;
    this.#counters.admitted += 1;
    this.#record({ type: "capacity.admitted", count: 1 });
    this.#recordActive();
    let released = false;
    return {
      release: () => {
        if (released) return this.#handleDuplicateRelease();
        released = true;
        this.#releasePermit();
        return Promise.resolve();
      },
    };
  }

  #releasePermit(): void {
    this.#counters.active -= 1;
    this.#recordActive();
    if (this.#counters.active === 0) this.#resolveIdleWaiters();
    const waiter = this.#queue.shift();
    if (waiter === undefined) return;
    this.#settleQueued(waiter);
    waiter.resolve(this.#grantLease());
  }

  #handleDuplicateRelease(): Promise<void> {
    this.#counters.duplicateReleases += 1;
    if (this.#releaseMode === TURN_ADMISSION_RELEASE_MODES.STRICT) {
      return Promise.reject(new DuplicateTurnAdmissionReleaseError());
    }
    return Promise.resolve();
  }

  #rejectTimedOut(waiter: QueuedTurn): void {
    if (!this.#removeQueued(waiter)) return;
    this.#counters.rejected += 1;
    this.#record({ type: "capacity.rejected", count: 1 });
    this.#settleQueued(waiter);
    waiter.reject(capacityError());
  }

  #cancelQueued(waiter: QueuedTurn): void {
    if (!this.#removeQueued(waiter)) return;
    this.#counters.cancelledWhileQueued += 1;
    this.#settleQueued(waiter);
    waiter.reject(abortError(waiter.signal));
  }

  #removeQueued(waiter: QueuedTurn): boolean {
    const index = this.#queue.indexOf(waiter);
    if (index < 0 || waiter.settled) return false;
    this.#queue.splice(index, 1);
    return true;
  }

  #settleQueued(waiter: QueuedTurn): void {
    if (waiter.settled) return;
    waiter.settled = true;
    waiter.timer?.cancel();
    if (waiter.signal !== undefined && waiter.abortListener !== undefined) {
      waiter.signal.removeEventListener("abort", waiter.abortListener);
    }
    const durationMs = Math.max(this.#clock.now() - waiter.enqueuedAt, 0);
    this.#counters.queueWaitDurationMs += durationMs;
    this.#record({ type: "capacity.queue_wait", durationMs });
  }

  #recordActive(): void {
    this.#record({ type: "capacity.active", value: this.#counters.active });
  }

  #record(record: Parameters<TelemetrySink["record"]>[0]): void {
    recordTelemetrySafely(this.#telemetry, record);
  }

  #rejectDraining(): Promise<TurnAdmissionLease> {
    this.#counters.rejected += 1;
    this.#record({ type: "capacity.rejected", count: 1 });
    return Promise.reject(drainingError());
  }

  #resolveIdleWaiters(): void {
    if (this.#counters.active !== 0) return;
    for (const resolve of this.#idleWaiters) resolve();
    this.#idleWaiters.clear();
  }
}
