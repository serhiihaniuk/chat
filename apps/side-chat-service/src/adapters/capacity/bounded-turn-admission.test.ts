import { describe, expect, it } from "vitest";

import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { TelemetryRecord } from "#application/ports/telemetry-sink";

import {
  BoundedTurnAdmission,
  DuplicateTurnAdmissionReleaseError,
  TURN_ADMISSION_RELEASE_MODES,
  type TurnAdmissionClock,
  type TurnAdmissionTimer,
} from "./bounded-turn-admission.js";

describe("BoundedTurnAdmission", () => {
  it("admits queued turns in FIFO order as permits are released", async () => {
    const admission = createAdmission({ maxActiveTurns: 1, queueSize: 2 });
    const first = await admission.admitTurn("conversation-1");
    const order: string[] = [];
    const secondPending = admission.admitTurn("conversation-2").then((lease) => {
      order.push("second");
      return lease;
    });
    const thirdPending = admission.admitTurn("conversation-3").then((lease) => {
      order.push("third");
      return lease;
    });

    expect(admission.snapshot()).toMatchObject({
      admitted: 1,
      queued: 2,
      active: 1,
    });
    await first.release();
    const second = await secondPending;
    expect(order).toEqual(["second"]);
    await second.release();
    const third = await thirdPending;
    expect(order).toEqual(["second", "third"]);
    await third.release();
    expect(admission.snapshot()).toMatchObject({
      admitted: 3,
      active: 0,
      rejected: 0,
    });
  });

  it("rejects immediately when the bounded queue is full", async () => {
    const admission = createAdmission({ maxActiveTurns: 1, queueSize: 1 });
    const active = await admission.admitTurn("conversation-1");
    const queued = admission.admitTurn("conversation-2");

    await expect(admission.admitTurn("conversation-3")).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.CAPACITY,
      retryAfterSeconds: 5,
    });
    expect(admission.snapshot()).toMatchObject({
      queued: 1,
      rejected: 1,
      active: 1,
    });

    await active.release();
    await (await queued).release();
  });

  it("times out a queued turn without consuming a permit", async () => {
    const clock = new ManualTurnAdmissionClock();
    const admission = createAdmission({
      clock,
      maxActiveTurns: 1,
      queueSize: 1,
    });
    const active = await admission.admitTurn("conversation-1");
    const queued = admission.admitTurn("conversation-2");
    const rejection = queued.catch((error: unknown) => error);

    clock.advanceBy(5_000);

    await expect(rejection).resolves.toBeInstanceOf(TurnRejectedError);
    expect(admission.snapshot()).toEqual({
      admitted: 1,
      queued: 1,
      rejected: 1,
      cancelledWhileQueued: 0,
      active: 1,
      queueWaitDurationMs: 5_000,
      duplicateReleases: 0,
    });
    await active.release();
  });

  it("removes an aborted waiter and preserves FIFO for the remaining queue", async () => {
    const clock = new ManualTurnAdmissionClock();
    const admission = createAdmission({
      clock,
      maxActiveTurns: 1,
      queueSize: 2,
    });
    const active = await admission.admitTurn("conversation-1");
    const controller = new AbortController();
    const cancelled = admission.admitTurn("conversation-2", {
      signal: controller.signal,
    });
    const cancellation = cancelled.catch((error: unknown) => error);
    const remaining = admission.admitTurn("conversation-3");

    clock.advanceBy(25);
    controller.abort();
    await expect(cancellation).resolves.toMatchObject({ name: "AbortError" });
    await active.release();
    const remainingLease = await remaining;

    expect(admission.snapshot()).toMatchObject({
      admitted: 2,
      queued: 2,
      cancelledWhileQueued: 1,
      active: 1,
      queueWaitDurationMs: 50,
    });
    await remainingLease.release();
  });

  it("does not admit a request whose signal is already aborted", async () => {
    const admission = createAdmission();
    const controller = new AbortController();
    controller.abort();

    await expect(
      admission.admitTurn("conversation-1", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(admission.snapshot()).toMatchObject({ admitted: 0, active: 0 });
  });

  it("keeps production release idempotent and counts duplicate release attempts", async () => {
    const admission = createAdmission();
    const lease = await admission.admitTurn("conversation-1");

    await lease.release();
    await lease.release();

    expect(admission.snapshot()).toMatchObject({
      active: 0,
      duplicateReleases: 1,
    });
  });

  it("throws on duplicate release in strict mode after preserving permit state", async () => {
    const admission = createAdmission({
      releaseMode: TURN_ADMISSION_RELEASE_MODES.STRICT,
    });
    const lease = await admission.admitTurn("conversation-1");

    await lease.release();
    await expect(lease.release()).rejects.toBeInstanceOf(DuplicateTurnAdmissionReleaseError);
    expect(admission.snapshot()).toMatchObject({
      active: 0,
      duplicateReleases: 1,
    });
  });

  it("emits content-free counters, the active gauge, and queue wait duration", async () => {
    const clock = new ManualTurnAdmissionClock();
    const records: TelemetryRecord[] = [];
    const admission = createAdmission({
      clock,
      maxActiveTurns: 1,
      queueSize: 1,
      telemetry: { record: (record) => void records.push(record) },
    });
    const active = await admission.admitTurn("conversation-1");
    const queued = admission.admitTurn("conversation-2");
    clock.advanceBy(25);

    await active.release();
    await (await queued).release();

    expect(records).toEqual([
      { type: "capacity.admitted", count: 1 },
      { type: "capacity.active", value: 1 },
      { type: "capacity.queued", count: 1 },
      { type: "capacity.active", value: 0 },
      { type: "capacity.queue_wait", durationMs: 25 },
      { type: "capacity.admitted", count: 1 },
      { type: "capacity.active", value: 1 },
      { type: "capacity.active", value: 0 },
    ]);
  });

  it("keeps admission fail-open when telemetry throws", async () => {
    const admission = createAdmission({
      telemetry: {
        record: () => {
          throw new Error("telemetry unavailable");
        },
      },
    });

    const lease = await admission.admitTurn("conversation-1");
    await expect(lease.release()).resolves.toBeUndefined();
    expect(admission.snapshot()).toMatchObject({ admitted: 1, active: 0 });
  });

  it("stops new admission, rejects queued work, and resolves when active turns drain", async () => {
    const admission = createAdmission({ maxActiveTurns: 1, queueSize: 1 });
    const active = await admission.admitTurn("conversation-1");
    const queued = admission.admitTurn("conversation-2");
    const idle = admission.whenIdle();

    admission.stopAccepting();

    await expect(queued).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.CAPACITY,
      retryAfterSeconds: 5,
    });
    await expect(admission.admitTurn("conversation-3")).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.CAPACITY,
    });
    expect(admission.snapshot()).toMatchObject({ active: 1, rejected: 2 });

    await active.release();
    await expect(idle).resolves.toBeUndefined();
    await expect(admission.whenIdle()).resolves.toBeUndefined();
  });

  it("keeps FIFO ordering and counters stable across repeated saturated batches", async () => {
    for (let round = 0; round < 25; round += 1) {
      const admission = createAdmission({ maxActiveTurns: 3, queueSize: 17 });
      const firstActive = await admission.admitTurn(`round-${round}-active-0`);
      const secondActive = await admission.admitTurn(`round-${round}-active-1`);
      const thirdActive = await admission.admitTurn(`round-${round}-active-2`);
      const order: number[] = [];
      const queued = Array.from({ length: 17 }, (_, index) =>
        admission.admitTurn(`round-${round}-queued-${index}`).then((lease) => {
          order.push(index);
          return lease;
        }),
      );

      let lease = firstActive;
      for (const pending of queued) {
        await lease.release();
        lease = await pending;
      }
      await lease.release();
      await secondActive.release();
      await thirdActive.release();

      expect(order).toEqual(Array.from({ length: 17 }, (_, index) => index));
      expect(admission.snapshot()).toMatchObject({
        admitted: 20,
        queued: 17,
        rejected: 0,
        active: 0,
        duplicateReleases: 0,
      });
    }
  });

  it.each([
    [{ maxActiveTurns: 0 }, "maxActiveTurns must be a positive integer"],
    [{ queueSize: -1 }, "queueSize must be a non-negative integer"],
    [{ queueTimeoutMs: 0 }, "queueTimeoutMs must be a positive integer"],
  ])("rejects invalid bounds", (overrides, message) => {
    expect(() => createAdmission(overrides)).toThrow(message);
  });
});

type AdmissionOverrides = Partial<ConstructorParameters<typeof BoundedTurnAdmission>[0]>;

function createAdmission(overrides: AdmissionOverrides = {}): BoundedTurnAdmission {
  return new BoundedTurnAdmission({
    maxActiveTurns: 2,
    queueSize: 2,
    queueTimeoutMs: 5_000,
    ...overrides,
  });
}

type ScheduledTask = {
  readonly runAt: number;
  readonly task: () => void;
  cancelled: boolean;
};

class ManualTurnAdmissionClock implements TurnAdmissionClock {
  #currentTime = 0;
  readonly #tasks: ScheduledTask[] = [];

  now(): number {
    return this.#currentTime;
  }

  schedule(delayMs: number, task: () => void): TurnAdmissionTimer {
    const scheduled = {
      runAt: this.#currentTime + delayMs,
      task,
      cancelled: false,
    };
    this.#tasks.push(scheduled);
    return {
      cancel: () => {
        scheduled.cancelled = true;
      },
    };
  }

  advanceBy(durationMs: number): void {
    this.#currentTime += durationMs;
    const ready = this.#tasks
      .filter((scheduled) => !scheduled.cancelled && scheduled.runAt <= this.#currentTime)
      .sort((left, right) => left.runAt - right.runAt);
    for (const scheduled of ready) {
      scheduled.cancelled = true;
      scheduled.task();
    }
  }
}
