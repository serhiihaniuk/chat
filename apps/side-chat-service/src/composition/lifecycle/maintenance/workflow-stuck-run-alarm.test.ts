import { afterEach, describe, expect, it, vi } from "vitest";

import { WORKFLOW_JOURNAL_CLASSES } from "#config/declaration/side-chat-config";
import { validateSettings } from "#config/settings/resolve-settings";
import { createDefaultConfig } from "#config/settings/settings.test-fixture";
import { createCollectingTelemetrySink } from "#testing/collecting-telemetry-sink";
import { TOOL_APPROVAL_TIMEOUT_MS } from "#workflows/server-tools/index";

import {
  startWorkflowStuckRunAlarm,
  STUCK_RUN_ALARM_GRACE_MS,
  stuckRunAlarmThresholdMs,
} from "./workflow-stuck-run-alarm.js";

afterEach(() => vi.useRealTimers());

describe("Workflow stuck-run alarm", () => {
  it("alerts for an old non-terminal run but not a normal maximum-duration wait", async () => {
    vi.useFakeTimers();
    const checkedAt = new Date("2026-07-16T12:00:00.000Z");
    const settings = testSettings();
    const thresholdMs = stuckRunAlarmThresholdMs(settings);
    const ages = [thresholdMs, thresholdMs + 1];
    const maintenance = {
      oldestNonterminalRun: () => {
        const ageMs = ages.shift();
        return Promise.resolve(
          ageMs === undefined
            ? undefined
            : { ageMs, startedAt: new Date(checkedAt.getTime() - ageMs) },
        );
      },
    };
    const telemetry = createCollectingTelemetrySink();
    const part = await startWorkflowStuckRunAlarm(
      settings,
      maintenance,
      telemetry,
      () => checkedAt,
    );

    expect(telemetry.records).toEqual([]);
    await vi.advanceTimersByTimeAsync(settings.workflow.journalSweepIntervalMs);
    expect(telemetry.records).toEqual([
      {
        type: "workflow.nonterminal_stuck",
        oldestRunAgeMs: thresholdMs + 1,
        oldestRunStartedAt: new Date(checkedAt.getTime() - thresholdMs - 1).toISOString(),
      },
    ]);

    await part.close();
  });

  it("uses the fixed approval wait when it exceeds deployment-configured waits", () => {
    expect(stuckRunAlarmThresholdMs(testSettings())).toBe(
      TOOL_APPROVAL_TIMEOUT_MS + STUCK_RUN_ALARM_GRACE_MS,
    );
  });

  it("fails open when either the maintenance query or telemetry sink throws", async () => {
    const settings = testSettings();
    const queryFailurePart = await startWorkflowStuckRunAlarm(
      settings,
      {
        oldestNonterminalRun: () => Promise.reject(new Error("database secret")),
      },
      {
        record: () => {
          throw new Error("telemetry unavailable");
        },
      },
    );
    expect(queryFailurePart).toMatchObject({
      name: "workflow stuck-run alarm",
    });
    await queryFailurePart.close();

    const thresholdMs = stuckRunAlarmThresholdMs(settings);
    const part = await startWorkflowStuckRunAlarm(
      settings,
      {
        oldestNonterminalRun: () =>
          Promise.resolve({
            ageMs: thresholdMs + 1,
            startedAt: new Date("2026-07-15T00:00:00.000Z"),
          }),
      },
      {
        record: () => {
          throw new Error("telemetry unavailable");
        },
      },
    );
    await expect(part.close()).resolves.toBeUndefined();
  });
});

function testSettings() {
  const result = validateSettings(
    createDefaultConfig({
      workflow: {
        journalClass: WORKFLOW_JOURNAL_CLASSES.OPERATIONAL,
        journalSweepIntervalMs: 1_000,
      },
    }),
  );
  if (!result.ok) throw new Error("Test settings must be valid.");
  return result.settings;
}
