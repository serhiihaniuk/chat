/**
 * Settings boundary mental model: decode the unknown resolved declaration,
 * accumulate shape issues, apply cross-field policy only to the decoded
 * values, then freeze the valid result. These stages stay together so boot has
 * one secret-safe validation boundary; provider and runtime behavior remain
 * outside this dependency-free config module.
 */
export type SettingsIssue = {
  readonly path: string;
  readonly message: string;
};

export type SettingsResult =
  | { readonly ok: true; readonly settings: Settings }
  | { readonly ok: false; readonly issues: readonly SettingsIssue[] };

export type Settings = Readonly<{
  timeouts: Readonly<{ requestMs: number; queueMs: number; providerMs: number }>;
  agent: Readonly<{
    maxSteps: number;
    totalTokenBudget: number;
    chunkTokenBudget: number;
    toolTokenBudget: number;
  }>;
  capacity: Readonly<{ activeGenerations: number }>;
  keepalive: Readonly<{ intervalMs: number; proxyIdleBudgetMs: number }>;
  telemetry: Readonly<{ enabled: boolean }>;
  workflow: Readonly<{
    workerConcurrency: number;
    concurrencyHeadroom: number;
    journalArchiveAfterDays: number;
    journalPruneAfterDays: number;
    postgresUrl?: string | undefined;
  }>;
}>;

/** Validate the resolved config as one dependency-free boundary and accumulate safe issues. */
export function validateSettings(candidate: unknown): SettingsResult {
  const issues: SettingsIssue[] = [];
  const settings = readSettings(candidate, issues);
  if (issues.length > 0) return { ok: false, issues };

  validateCrossFieldRules(settings, issues);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, settings: deepFreeze(settings) };
}

export const formatSettingsIssues = (issues: readonly SettingsIssue[]): string =>
  issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");

function readSettings(candidate: unknown, issues: SettingsIssue[]): Settings {
  const root = readObject(candidate, "configuration", issues);
  const timeouts = readObject(root["timeouts"], "timeouts", issues);
  const agent = readObject(root["agent"], "agent", issues);
  const capacity = readObject(root["capacity"], "capacity", issues);
  const keepalive = readObject(root["keepalive"], "keepalive", issues);
  const telemetry = readObject(root["telemetry"], "telemetry", issues);
  const workflow = readObject(root["workflow"], "workflow", issues);

  return {
    timeouts: {
      requestMs: readPositiveInteger(timeouts["requestMs"], "timeouts.requestMs", issues),
      queueMs: readPositiveInteger(timeouts["queueMs"], "timeouts.queueMs", issues),
      providerMs: readPositiveInteger(timeouts["providerMs"], "timeouts.providerMs", issues),
    },
    agent: {
      maxSteps: readPositiveInteger(agent["maxSteps"], "agent.maxSteps", issues),
      totalTokenBudget: readPositiveInteger(
        agent["totalTokenBudget"],
        "agent.totalTokenBudget",
        issues,
      ),
      chunkTokenBudget: readPositiveInteger(
        agent["chunkTokenBudget"],
        "agent.chunkTokenBudget",
        issues,
      ),
      toolTokenBudget: readPositiveInteger(
        agent["toolTokenBudget"],
        "agent.toolTokenBudget",
        issues,
      ),
    },
    capacity: {
      activeGenerations: readPositiveInteger(
        capacity["activeGenerations"],
        "capacity.activeGenerations",
        issues,
      ),
    },
    keepalive: {
      intervalMs: readPositiveInteger(keepalive["intervalMs"], "keepalive.intervalMs", issues),
      proxyIdleBudgetMs: readPositiveInteger(
        keepalive["proxyIdleBudgetMs"],
        "keepalive.proxyIdleBudgetMs",
        issues,
      ),
    },
    telemetry: { enabled: readBoolean(telemetry["enabled"], "telemetry.enabled", issues) },
    workflow: {
      workerConcurrency: readPositiveInteger(
        workflow["workerConcurrency"],
        "workflow.workerConcurrency",
        issues,
      ),
      concurrencyHeadroom: readNonnegativeInteger(
        workflow["concurrencyHeadroom"],
        "workflow.concurrencyHeadroom",
        issues,
      ),
      journalArchiveAfterDays: readPositiveInteger(
        workflow["journalArchiveAfterDays"],
        "workflow.journalArchiveAfterDays",
        issues,
      ),
      journalPruneAfterDays: readPositiveInteger(
        workflow["journalPruneAfterDays"],
        "workflow.journalPruneAfterDays",
        issues,
      ),
      postgresUrl: readOptionalString(workflow["postgresUrl"], "workflow.postgresUrl", issues),
    },
  };
}

function validateCrossFieldRules(settings: Settings, issues: SettingsIssue[]): void {
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

  const requiredConcurrency =
    settings.capacity.activeGenerations + settings.workflow.concurrencyHeadroom;
  if (settings.workflow.workerConcurrency < requiredConcurrency) {
    issues.push({
      path: "workflow.workerConcurrency",
      message: `must be at least active generations plus headroom (${requiredConcurrency})`,
    });
  }
  if (settings.workflow.journalPruneAfterDays <= settings.workflow.journalArchiveAfterDays) {
    issues.push({
      path: "workflow.journalPruneAfterDays",
      message: "must be greater than journal archive age",
    });
  }
}

function readObject(
  value: unknown,
  path: string,
  issues: SettingsIssue[],
): Readonly<Record<string, unknown>> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value));
  }
  issues.push({ path, message: "must be an object" });
  return {};
}

function readPositiveInteger(value: unknown, path: string, issues: SettingsIssue[]): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  issues.push({ path, message: "must be a positive integer" });
  return 0;
}

function readNonnegativeInteger(value: unknown, path: string, issues: SettingsIssue[]): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  issues.push({ path, message: "must be a nonnegative integer" });
  return 0;
}

function readBoolean(value: unknown, path: string, issues: SettingsIssue[]): boolean {
  if (typeof value === "boolean") return value;
  issues.push({ path, message: "must be a boolean" });
  return false;
}

function readOptionalString(
  value: unknown,
  path: string,
  issues: SettingsIssue[],
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && value.length > 0) return value;
  issues.push({ path, message: "must be a non-empty string" });
  return undefined;
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

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
