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
  validateMaintenanceDatabase(settings, issues);
}

function validateMaintenanceDatabase(settings: Settings, issues: SettingsIssue[]): void {
  const productUrl = settings.persistence.databaseUrl;
  const workflowUrl = settings.workflow.postgresUrl;
  if (productUrl === undefined || workflowUrl === undefined) return;
  const productDatabase = identifyPostgresDatabase(productUrl);
  const workflowDatabase = identifyPostgresDatabase(workflowUrl);
  if (productDatabase !== undefined && productDatabase === workflowDatabase) return;
  issues.push({
    path: "workflow.postgresUrl",
    message: "must use the product Postgres database for legal-hold-safe journal pruning",
  });
}

function identifyPostgresDatabase(connectionString: string): string | undefined {
  try {
    const url = new URL(connectionString);
    return `${url.protocol}//${url.hostname.toLowerCase()}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return undefined;
  }
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
