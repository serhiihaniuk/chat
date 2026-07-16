import type { AuthSettings, ModelSettings } from "../deployment-settings.js";
import type { SettingsIssue } from "../setting-readers.js";
import type { TELEMETRY_MODES, WorkflowJournalClass } from "../../declaration/side-chat-config.js";

export type SettingsResult =
  | { readonly ok: true; readonly settings: Settings }
  | { readonly ok: false; readonly issues: readonly SettingsIssue[] };

export type Settings = Readonly<{
  models: ModelSettings;
  conversationTitle: Readonly<{ modelId: string; timeoutMs: number }>;
  serverTools: readonly string[];
  hostContext: Readonly<{
    enabled: boolean;
    maxSerializedBytes: number;
    maxStringLength: number;
    maxMetadataDepth: number;
    maxMetadataEntries: number;
  }>;
  auth: AuthSettings;
  timeouts: Readonly<{
    queueMs: number;
    providerMs: number;
    clientToolMs: number;
  }>;
  capacity: Readonly<{
    maxActiveTurns: number;
    queueSize: number;
    queueTimeoutMs: number;
    drainBudgetMs: number;
  }>;
  agent: Readonly<{
    instructions: string;
    maxSteps: number;
  }>;
  persistence: Readonly<{ databaseUrl?: string | undefined }>;
  keepalive: Readonly<{ intervalMs: number }>;
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
    maxPoolSize: number;
    journalPruneAfterDays: number;
    journalSweepIntervalMs: number;
    journalClass: WorkflowJournalClass;
    postgresUrl?: string | undefined;
  }>;
}>;
