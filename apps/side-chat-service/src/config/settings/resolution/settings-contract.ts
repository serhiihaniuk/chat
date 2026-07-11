import type { AuthSettings, ModelSettings } from "../deployment-settings.js";
import type { SettingsIssue } from "../setting-readers.js";
import type {
  TELEMETRY_MODES,
  WorkflowJournalClass,
} from "../../declaration/side-chat-config.js";

export type SettingsResult =
  | { readonly ok: true; readonly settings: Settings }
  | { readonly ok: false; readonly issues: readonly SettingsIssue[] };

export type Settings = Readonly<{
  models: ModelSettings;
  auth: AuthSettings;
  timeouts: Readonly<{
    requestMs: number;
    queueMs: number;
    providerMs: number;
    clientToolMs: number;
    titleMs: number;
  }>;
  agent: Readonly<{
    instructions: string;
    maxSteps: number;
    totalTokenBudget: number;
    chunkTokenBudget: number;
    toolTokenBudget: number;
  }>;
  capacity: Readonly<{ activeGenerations: number }>;
  persistence: Readonly<{ databaseUrl?: string | undefined }>;
  keepalive: Readonly<{ intervalMs: number; proxyIdleBudgetMs: number }>;
  telemetry:
    | Readonly<{ mode: typeof TELEMETRY_MODES.OFF }>
    | Readonly<{ mode: typeof TELEMETRY_MODES.CONSOLE }>
    | Readonly<{
        mode: typeof TELEMETRY_MODES.OTLP;
        endpoint: string;
        serviceName: string;
      }>;
  workflow: Readonly<{
    workerConcurrency: number;
    concurrencyHeadroom: number;
    journalPruneAfterDays: number;
    journalSweepIntervalMs: number;
    journalClass: WorkflowJournalClass;
    postgresUrl?: string | undefined;
  }>;
}>;
