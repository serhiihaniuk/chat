import { z } from "zod";

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

const positiveInteger = z.number().int().positive();
const settingsSchema = z
  .object({
    timeouts: z.object({
      requestMs: positiveInteger,
      queueMs: positiveInteger,
      providerMs: positiveInteger,
    }),
    agent: z.object({
      maxSteps: positiveInteger,
      totalTokenBudget: positiveInteger,
      chunkTokenBudget: positiveInteger,
      toolTokenBudget: positiveInteger,
    }),
    capacity: z.object({ activeGenerations: positiveInteger }),
    keepalive: z.object({ intervalMs: positiveInteger, proxyIdleBudgetMs: positiveInteger }),
    telemetry: z.object({ enabled: z.boolean() }),
    workflow: z.object({
      workerConcurrency: positiveInteger,
      concurrencyHeadroom: z.number().int().nonnegative(),
      journalArchiveAfterDays: positiveInteger,
      journalPruneAfterDays: positiveInteger,
      postgresUrl: z.string().min(1).optional(),
    }),
  })
  .superRefine((settings, context) => {
    addLessThanIssue(
      context,
      settings.timeouts.queueMs,
      settings.timeouts.requestMs,
      ["timeouts", "queueMs"],
      "request timeout",
    );
    addLessThanIssue(
      context,
      settings.agent.chunkTokenBudget,
      settings.agent.totalTokenBudget,
      ["agent", "chunkTokenBudget"],
      "total token budget",
    );
    addLessThanIssue(
      context,
      settings.agent.toolTokenBudget,
      settings.agent.totalTokenBudget,
      ["agent", "toolTokenBudget"],
      "total token budget",
    );
    addLessThanIssue(
      context,
      settings.keepalive.intervalMs,
      settings.keepalive.proxyIdleBudgetMs,
      ["keepalive", "intervalMs"],
      "proxy idle budget",
    );

    const requiredConcurrency =
      settings.capacity.activeGenerations + settings.workflow.concurrencyHeadroom;
    if (settings.workflow.workerConcurrency < requiredConcurrency) {
      context.addIssue({
        code: "custom",
        path: ["workflow", "workerConcurrency"],
        message: `must be at least active generations plus headroom (${requiredConcurrency})`,
      });
    }
    if (settings.workflow.journalPruneAfterDays <= settings.workflow.journalArchiveAfterDays) {
      context.addIssue({
        code: "custom",
        path: ["workflow", "journalPruneAfterDays"],
        message: "must be greater than journal archive age",
      });
    }
  });

export function validateSettings(candidate: unknown): SettingsResult {
  const parsed = settingsSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }
  return { ok: true, settings: deepFreeze(parsed.data) };
}

export const formatSettingsIssues = (issues: readonly SettingsIssue[]): string =>
  issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");

function addLessThanIssue(
  context: z.RefinementCtx,
  value: number,
  limit: number,
  path: readonly string[],
  limitName: string,
): void {
  if (value < limit) return;
  context.addIssue({ code: "custom", path: [...path], message: `must be below ${limitName}` });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
