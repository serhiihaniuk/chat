import type { Settings } from "./settings-contract.js";
import type { SettingsIssue } from "../setting-readers.js";

/** Apply relationships that cannot be validated while decoding one field. */
export function validateSettingsPolicy(settings: Settings, issues: SettingsIssue[]): void {
  addLessThanIssue(
    settings.timeouts.queueMs,
    settings.timeouts.requestMs,
    "timeouts.queueMs",
    "request timeout",
    issues,
  );
  addLessThanIssue(
    settings.agent.chunkTokenBudget,
    settings.agent.totalTokenBudget,
    "agent.chunkTokenBudget",
    "total token budget",
    issues,
  );
  addLessThanIssue(
    settings.agent.toolTokenBudget,
    settings.agent.totalTokenBudget,
    "agent.toolTokenBudget",
    "total token budget",
    issues,
  );
  addLessThanIssue(
    settings.keepalive.intervalMs,
    settings.keepalive.proxyIdleBudgetMs,
    "keepalive.intervalMs",
    "proxy idle budget",
    issues,
  );

  validateWorkerConcurrency(settings, issues);
  validateJournalRetention(settings, issues);
}

function validateWorkerConcurrency(settings: Settings, issues: SettingsIssue[]): void {
  const requiredConcurrency =
    settings.capacity.activeGenerations + settings.workflow.concurrencyHeadroom;
  if (settings.workflow.workerConcurrency >= requiredConcurrency) return;
  issues.push({
    path: "workflow.workerConcurrency",
    message: `must be at least active generations plus headroom (${requiredConcurrency})`,
  });
}

function validateJournalRetention(settings: Settings, issues: SettingsIssue[]): void {
  if (settings.workflow.journalPruneAfterDays > settings.workflow.journalArchiveAfterDays) return;
  issues.push({
    path: "workflow.journalPruneAfterDays",
    message: "must be greater than journal archive age",
  });
}

function addLessThanIssue(
  value: number,
  limit: number,
  path: string,
  limitName: string,
  issues: SettingsIssue[],
): void {
  if (value < limit) return;
  issues.push({ path, message: `must be below ${limitName}` });
}
