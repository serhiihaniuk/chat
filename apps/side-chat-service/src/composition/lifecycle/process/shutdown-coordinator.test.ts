import { describe, expect, it } from "vitest";

import { BoundedTurnAdmission } from "#adapters/capacity/bounded-turn-admission";
import type { TelemetryRecord } from "#application/ports/telemetry-sink";

import {
  createShutdownCoordinator,
  SHUTDOWN_OUTCOMES,
  SHUTDOWN_STAGES,
} from "./shutdown-coordinator.js";

describe("process shutdown coordinator", () => {
  it("orders readiness, drain, streams, server, world, and resources", async () => {
    const events: string[] = [];
    const admission = createAdmission();
    const active = await admission.admitTurn("conversation-1");
    const coordinator = createCoordinator(admission, events);
    coordinator.attachServer({
      close: () => {
        events.push("server");
        return Promise.resolve();
      },
      forceClose: () => void events.push("server:forced"),
    });

    const shutdown = coordinator.shutdown();
    expect(events).toEqual(["not-ready"]);
    await active.release();
    const observations = await shutdown;

    expect(events).toEqual(["not-ready", "streams", "server", "world", "resources"]);
    expect(observations.map(({ stage }) => stage)).toEqual([
      SHUTDOWN_STAGES.DRAIN,
      SHUTDOWN_STAGES.STREAMS,
      SHUTDOWN_STAGES.SERVER,
      SHUTDOWN_STAGES.WORLD,
      SHUTDOWN_STAGES.RESOURCES,
    ]);
    expect(observations.every(({ outcome }) => outcome === SHUTDOWN_OUTCOMES.COMPLETED)).toBe(true);
  });

  it("shares one shutdown across repeated signals and programmatic disposal", async () => {
    const events: string[] = [];
    const coordinator = createCoordinator(createAdmission(), events);

    const first = coordinator.shutdown();
    const second = coordinator.shutdown();
    coordinator.beginShutdown();
    await Promise.all([first, second]);

    expect(first).toBe(second);
    expect(events).toEqual(["not-ready", "streams", "world", "resources"]);
  });

  it("advances after stuck stages and records content-free timeouts", async () => {
    const events: string[] = [];
    const records: TelemetryRecord[] = [];
    const admission = createAdmission();
    await admission.admitTurn("blocked-turn");
    const coordinator = createCoordinator(admission, events, records, {
      closeStreams: () => new Promise<void>(() => undefined),
    });
    coordinator.attachServer({
      close: () => new Promise<void>(() => undefined),
      forceClose: () => void events.push("server:forced"),
    });

    const observations = await coordinator.shutdown();

    expect(observations).toMatchObject([
      { stage: SHUTDOWN_STAGES.DRAIN, outcome: SHUTDOWN_OUTCOMES.TIMED_OUT },
      { stage: SHUTDOWN_STAGES.STREAMS, outcome: SHUTDOWN_OUTCOMES.TIMED_OUT },
      { stage: SHUTDOWN_STAGES.SERVER, outcome: SHUTDOWN_OUTCOMES.TIMED_OUT },
      { stage: SHUTDOWN_STAGES.WORLD, outcome: SHUTDOWN_OUTCOMES.COMPLETED },
      { stage: SHUTDOWN_STAGES.RESOURCES, outcome: SHUTDOWN_OUTCOMES.COMPLETED },
    ]);
    expect(events).toContain("server:forced");
    expect(records).toHaveLength(5);
    expect(JSON.stringify(records)).not.toContain("blocked-turn");
  });
});

function createAdmission(): BoundedTurnAdmission {
  return new BoundedTurnAdmission({
    maxActiveTurns: 1,
    queueSize: 1,
    queueTimeoutMs: 1_000,
  });
}

function createCoordinator(
  admission: BoundedTurnAdmission,
  events: string[],
  records: TelemetryRecord[] = [],
  overrides: Readonly<{ closeStreams?: () => Promise<void> }> = {},
) {
  return createShutdownCoordinator({
    admission,
    scope: {
      beginShutdown: () => void events.push("not-ready"),
      close: () => {
        events.push("resources");
        return Promise.resolve();
      },
    },
    closeStreams:
      overrides.closeStreams ??
      (() => {
        events.push("streams");
        return Promise.resolve();
      }),
    closeWorld: () => {
      events.push("world");
      return Promise.resolve();
    },
    drainBudgetMs: 10,
    cleanupGraceMs: 40,
    telemetry: { record: (record) => void records.push(record) },
  });
}
