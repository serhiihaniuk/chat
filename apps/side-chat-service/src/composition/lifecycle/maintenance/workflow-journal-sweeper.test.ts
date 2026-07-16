import type { WorkflowJournalSweepResult } from "@side-chat/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WORKFLOW_JOURNAL_CLASSES } from "#config/declaration/side-chat-config";
import { validateSettings } from "#config/settings/resolve-settings";
import { createDefaultConfig } from "#config/settings/settings.test-fixture";
import { createCollectingTelemetrySink } from "#testing/collecting-telemetry-sink";

import { startWorkflowJournalSweeper } from "./workflow-journal-sweeper.js";

afterEach(() => vi.useRealTimers());

describe("workflow journal sweeper", () => {
  it("runs immediately, repeats on schedule, and stops cleanly", async () => {
    vi.useFakeTimers();
    const calls: Date[] = [];
    const maintenance = {
      validateSchema: () => Promise.resolve(),
      sweep: (options: { readonly completedBefore: Date }) => {
        calls.push(options.completedBefore);
        return Promise.resolve(emptyResult());
      },
    };
    const telemetry = createCollectingTelemetrySink();
    const settings = testSettings();
    const part = await startWorkflowJournalSweeper(
      settings,
      maintenance,
      telemetry,
      () => new Date("2026-07-11T00:00:00.000Z"),
    );

    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(settings.workflow.journalSweepIntervalMs);
    expect(calls).toHaveLength(2);

    await part.close();
    await vi.advanceTimersByTimeAsync(settings.workflow.journalSweepIntervalMs);
    expect(calls).toHaveLength(2);
  });

  it("reports a failed boot sweep and retries it on the next interval", async () => {
    vi.useFakeTimers();
    let attempt = 0;
    const maintenance = {
      validateSchema: () => Promise.resolve(),
      sweep: () => {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error("offline"))
          : Promise.resolve(emptyResult());
      },
    };
    const telemetry = createCollectingTelemetrySink();
    const settings = testSettings();
    const part = await startWorkflowJournalSweeper(settings, maintenance, telemetry);

    expect(telemetry.records).toContainEqual({ type: "workflow.journal_prune_error" });
    await vi.advanceTimersByTimeAsync(settings.workflow.journalSweepIntervalMs);
    expect(attempt).toBe(2);
    await part.close();
  });

  it("reports measured row bytes and the number of pruned runs", async () => {
    const telemetry = createCollectingTelemetrySink();
    const settings = testSettings();
    const part = await startWorkflowJournalSweeper(
      settings,
      {
        validateSchema: () => Promise.resolve(),
        sweep: () =>
          Promise.resolve({ ...emptyResult(), selectedRuns: 2, prunedRuns: 2, prunedBytes: 4_096 }),
      },
      telemetry,
    );

    expect(telemetry.records).toContainEqual({
      type: "workflow.journal_prune",
      count: 2,
      bytes: 4_096,
    });
    await part.close();
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

function emptyResult(): WorkflowJournalSweepResult {
  return {
    lockAcquired: true,
    selectedRuns: 0,
    archivedRuns: 0,
    prunedRuns: 0,
    prunedBytes: 0,
    deletedRows: { events: 0, steps: 0, hooks: 0, waits: 0, streamChunks: 0, runs: 0 },
  };
}
