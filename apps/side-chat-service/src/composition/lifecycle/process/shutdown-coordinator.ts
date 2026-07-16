import type { BoundedTurnAdmission } from "#adapters/capacity/bounded-turn-admission";
import type { TelemetrySink } from "#application/ports/telemetry-sink";
import { recordTelemetrySafely } from "#application/telemetry/record-telemetry-safely";

import type { StartedServiceScope } from "../resource-scope.js";

export const SHUTDOWN_STAGES = {
  DRAIN: "drain",
  STREAMS: "streams",
  SERVER: "server",
  WORLD: "world",
  RESOURCES: "resources",
} as const;

export const SHUTDOWN_OUTCOMES = {
  COMPLETED: "completed",
  FAILED: "failed",
  TIMED_OUT: "timed_out",
} as const;

const SHUTDOWN_CLEANUP_GRACE_MS = 5_000;
const CLEANUP_STAGE_COUNT = 4;

type ShutdownStage = (typeof SHUTDOWN_STAGES)[keyof typeof SHUTDOWN_STAGES];
type ShutdownOutcome = (typeof SHUTDOWN_OUTCOMES)[keyof typeof SHUTDOWN_OUTCOMES];

export type ShutdownObservation = Readonly<{
  stage: ShutdownStage;
  outcome: ShutdownOutcome;
  durationMs: number;
}>;

export type AttachedServer = Readonly<{
  close: () => Promise<void>;
  forceClose: () => void;
}>;

export type ShutdownCoordinator = Readonly<{
  beginShutdown: () => void;
  attachServer: (server: AttachedServer) => void;
  shutdown: () => Promise<readonly ShutdownObservation[]>;
  maxShutdownDurationMs: number;
}>;

export function createShutdownCoordinator(
  options: Readonly<{
    admission: Pick<BoundedTurnAdmission, "stopAccepting" | "whenIdle">;
    scope: Pick<StartedServiceScope, "beginShutdown" | "close">;
    closeStreams: () => Promise<void>;
    closeWorld: () => Promise<void>;
    drainBudgetMs: number;
    cleanupGraceMs?: number | undefined;
    telemetry: Pick<TelemetrySink, "record">;
  }>,
): ShutdownCoordinator {
  const cleanupGraceMs = options.cleanupGraceMs ?? SHUTDOWN_CLEANUP_GRACE_MS;
  const cleanupStageTimeoutMs = Math.max(Math.floor(cleanupGraceMs / CLEANUP_STAGE_COUNT), 1);
  let server: AttachedServer | undefined;
  let started = false;
  let shutdownPromise: Promise<readonly ShutdownObservation[]> | undefined;

  const beginShutdown = (): void => {
    if (started) return;
    started = true;
    options.scope.beginShutdown();
    options.admission.stopAccepting();
  };

  const shutdown = (): Promise<readonly ShutdownObservation[]> => {
    beginShutdown();
    shutdownPromise ??= runShutdown();
    return shutdownPromise;
  };

  const runShutdown = async (): Promise<readonly ShutdownObservation[]> => {
    const observations: ShutdownObservation[] = [];
    await observeStage(
      observations,
      SHUTDOWN_STAGES.DRAIN,
      () => options.admission.whenIdle(),
      options.drainBudgetMs,
    );
    await observeStage(
      observations,
      SHUTDOWN_STAGES.STREAMS,
      options.closeStreams,
      cleanupStageTimeoutMs,
    );
    await observeStage(
      observations,
      SHUTDOWN_STAGES.SERVER,
      server?.close ?? completedStage,
      cleanupStageTimeoutMs,
      server?.forceClose,
    );
    await observeStage(
      observations,
      SHUTDOWN_STAGES.WORLD,
      options.closeWorld,
      cleanupStageTimeoutMs,
    );
    await observeStage(
      observations,
      SHUTDOWN_STAGES.RESOURCES,
      () => options.scope.close(),
      cleanupStageTimeoutMs,
    );
    return observations;
  };

  const observeStage = async (
    observations: ShutdownObservation[],
    stage: ShutdownStage,
    action: () => Promise<void>,
    timeoutMs: number,
    onTimeout?: () => void,
  ): Promise<void> => {
    const observation = await runStage(stage, action, timeoutMs, onTimeout);
    observations.push(observation);
    recordObservation(options.telemetry, observation);
  };

  return {
    beginShutdown,
    attachServer: (attached) => void (server = attached),
    shutdown,
    maxShutdownDurationMs: options.drainBudgetMs + cleanupGraceMs,
  };
}

async function runStage(
  stage: ShutdownStage,
  action: () => Promise<void>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<ShutdownObservation> {
  const startedAt = Date.now();
  const task = Promise.resolve().then(action);
  const timeout = AbortSignal.timeout(timeoutMs);
  const outcome = await Promise.race([
    task.then(
      () => SHUTDOWN_OUTCOMES.COMPLETED,
      () => SHUTDOWN_OUTCOMES.FAILED,
    ),
    abortOutcome(timeout),
  ]);
  if (outcome === SHUTDOWN_OUTCOMES.TIMED_OUT) onTimeout?.();
  return { stage, outcome, durationMs: Date.now() - startedAt };
}

function abortOutcome(signal: AbortSignal): Promise<typeof SHUTDOWN_OUTCOMES.TIMED_OUT> {
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(SHUTDOWN_OUTCOMES.TIMED_OUT), { once: true });
  });
}

function recordObservation(
  telemetry: Pick<TelemetrySink, "record">,
  observation: ShutdownObservation,
): void {
  recordTelemetrySafely(telemetry, {
    type: "service.shutdown.stage",
    labels: { operation: observation.stage, outcomeTag: observation.outcome },
    durationMs: observation.durationMs,
  });
}

function completedStage(): Promise<void> {
  return Promise.resolve();
}
