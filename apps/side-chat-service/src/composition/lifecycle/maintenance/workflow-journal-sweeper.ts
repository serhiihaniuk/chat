import type { WorkflowJournalMaintenance } from "@side-chat/db";

import type { TelemetrySink } from "#application/ports/telemetry-sink";
import type { Settings } from "#config/settings/resolve-settings";

import type { StartedServicePart } from "../resource-scope.js";

const SWEEP_BATCH_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1_000;

type SweepTimers = Readonly<{
  setInterval: typeof globalThis.setInterval;
  clearInterval: typeof globalThis.clearInterval;
}>;

/** Start the boot sweep and recurring self-healing maintenance loop. */
export async function startWorkflowJournalSweeper(
  settings: Settings,
  maintenance: Pick<WorkflowJournalMaintenance, "validateSchema" | "sweep">,
  telemetry: Pick<TelemetrySink, "record">,
  now: () => Date = () => new Date(),
  timers: SweepTimers = {
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  },
): Promise<StartedServicePart> {
  await maintenance.validateSchema();
  let closed = false;
  let running = false;
  let inFlight = Promise.resolve();
  const startSweep = () => {
    if (closed || running) return;
    running = true;
    inFlight = runSweepToEmpty(settings, maintenance, telemetry, now).finally(() => {
      running = false;
    });
  };
  startSweep();
  await inFlight;

  const interval = timers.setInterval(startSweep, settings.workflow.journalSweepIntervalMs);

  return {
    name: "workflow journal sweeper",
    close: async () => {
      closed = true;
      timers.clearInterval(interval);
      await inFlight;
    },
  };
}

async function runSweepToEmpty(
  settings: Settings,
  maintenance: Pick<WorkflowJournalMaintenance, "sweep">,
  telemetry: Pick<TelemetrySink, "record">,
  now: () => Date,
): Promise<void> {
  try {
    const completedBefore = new Date(
      now().getTime() - settings.workflow.journalPruneAfterDays * DAY_MS,
    );
    while (true) {
      const result = await maintenance.sweep({
        completedBefore,
        batchLimit: SWEEP_BATCH_LIMIT,
      });
      if (result.prunedRuns > 0) {
        await telemetry.record({
          type: "workflow.journal_prune",
          count: result.prunedRuns,
          bytes: result.prunedBytes,
        });
      }
      if (!result.lockAcquired || result.selectedRuns < SWEEP_BATCH_LIMIT) return;
    }
  } catch {
    // Maintenance is self-healing: a transient failure is observable, then the
    // next scheduled sweep retries the same still-durable journals.
    await telemetry.record({ type: "workflow.journal_prune_error" });
  }
}
