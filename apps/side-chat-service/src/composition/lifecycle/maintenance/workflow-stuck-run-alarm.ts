import type { WorkflowJournalMaintenance } from "@side-chat/db";

import type { TelemetrySink } from "#application/ports/telemetry-sink";
import type { Settings } from "#config/settings/resolve-settings";
import { TOOL_APPROVAL_TIMEOUT_MS } from "#workflows/server-tools/index";

import type { StartedServicePart } from "../resource-scope.js";

export const STUCK_RUN_ALARM_GRACE_MS = 60 * 60 * 1_000;

type AlarmTimers = Readonly<{
  setInterval: typeof globalThis.setInterval;
  clearInterval: typeof globalThis.clearInterval;
}>;

/** Periodically alert when a Workflow run outlives every legitimate durable wait. */
export async function startWorkflowStuckRunAlarm(
  settings: Settings,
  maintenance: Pick<WorkflowJournalMaintenance, "oldestNonterminalRun">,
  telemetry: Pick<TelemetrySink, "record">,
  now: () => Date = () => new Date(),
  timers: AlarmTimers = {
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  },
): Promise<StartedServicePart> {
  let closed = false;
  let running = false;
  let inFlight = Promise.resolve();
  const thresholdMs = stuckRunAlarmThresholdMs(settings);
  const startCheck = () => {
    if (closed || running) return;
    running = true;
    inFlight = checkOldestRun(maintenance, telemetry, now(), thresholdMs).finally(() => {
      running = false;
    });
  };

  startCheck();
  await inFlight;
  const interval = timers.setInterval(startCheck, settings.workflow.journalSweepIntervalMs);

  return {
    name: "workflow stuck-run alarm",
    close: async () => {
      closed = true;
      timers.clearInterval(interval);
      await inFlight;
    },
  };
}

export function stuckRunAlarmThresholdMs(settings: Settings): number {
  const largestDurableWaitMs = Math.max(
    settings.timeouts.providerMs,
    settings.timeouts.clientToolMs,
    settings.conversationTitle.timeoutMs,
    TOOL_APPROVAL_TIMEOUT_MS,
  );
  return largestDurableWaitMs + STUCK_RUN_ALARM_GRACE_MS;
}

async function checkOldestRun(
  maintenance: Pick<WorkflowJournalMaintenance, "oldestNonterminalRun">,
  telemetry: Pick<TelemetrySink, "record">,
  checkedAt: Date,
  thresholdMs: number,
): Promise<void> {
  try {
    const oldest = await maintenance.oldestNonterminalRun(checkedAt);
    if (oldest === undefined || oldest.ageMs <= thresholdMs) return;
    await telemetry.record({
      type: "workflow.nonterminal_stuck",
      oldestRunAgeMs: oldest.ageMs,
      oldestRunStartedAt: oldest.startedAt.toISOString(),
    });
  } catch {
    // Alarm instrumentation is fail-open: maintenance or telemetry failure must
    // never change readiness, admission, or an in-flight product outcome.
  }
}
