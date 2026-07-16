import { readDeploymentSettings } from "../deployment-settings.js";
import type { Settings } from "./settings-contract.js";
import {
  readArray,
  readObject,
  readOptionalString,
  readRequiredBoolean,
  readRequiredNonNegativeInteger,
  readRequiredPositiveInteger,
  readRequiredCatalogValue,
  readRequiredString,
  type SettingsIssue,
} from "../setting-readers.js";
import {
  TELEMETRY_MODES,
  TELEMETRY_MODE_VALUES,
  WORKFLOW_JOURNAL_CLASSES,
  WORKFLOW_JOURNAL_CLASS_VALUES,
} from "../../declaration/side-chat-config.js";

/** Decode each top-level settings section without applying cross-field policy. */
export function readSettings(candidate: unknown, issues: SettingsIssue[]): Settings {
  const root = readObject(candidate, "configuration", issues);
  const deployment = readDeploymentSettings(root["models"], root["auth"], issues);

  return {
    models: deployment.models,
    conversationTitle: readConversationTitle(root["conversationTitle"], issues),
    serverTools: readServerTools(root["serverTools"], issues),
    hostContext: readHostContext(root["hostContext"], issues),
    auth: deployment.auth,
    timeouts: readTimeouts(root["timeouts"], issues),
    capacity: readCapacity(root["capacity"], issues),
    agent: readAgent(root["agent"], issues),
    persistence: readPersistence(root["persistence"], issues),
    keepalive: readKeepalive(root["keepalive"], issues),
    telemetry: readTelemetry(root["telemetry"], issues),
    workflow: readWorkflow(root["workflow"], issues),
  };
}

function readCapacity(candidate: unknown, issues: SettingsIssue[]): Settings["capacity"] {
  const value = readObject(candidate, "capacity", issues);
  return {
    maxActiveTurns: readRequiredPositiveInteger(
      value["maxActiveTurns"],
      "capacity.maxActiveTurns",
      issues,
    ),
    queueSize: readRequiredNonNegativeInteger(value["queueSize"], "capacity.queueSize", issues),
    queueTimeoutMs: readRequiredPositiveInteger(
      value["queueTimeoutMs"],
      "capacity.queueTimeoutMs",
      issues,
    ),
    drainBudgetMs: readRequiredPositiveInteger(
      value["drainBudgetMs"],
      "capacity.drainBudgetMs",
      issues,
    ),
  };
}

function readConversationTitle(
  candidate: unknown,
  issues: SettingsIssue[],
): Settings["conversationTitle"] {
  const value = readObject(candidate, "conversationTitle", issues);
  return {
    modelId: readRequiredString(value["modelId"], "conversationTitle.modelId", issues),
    timeoutMs: readRequiredPositiveInteger(
      value["timeoutMs"],
      "conversationTitle.timeoutMs",
      issues,
    ),
  };
}

function readServerTools(candidate: unknown, issues: SettingsIssue[]): readonly string[] {
  return readArray(candidate, "serverTools", issues).map((name, index) =>
    readRequiredString(name, `serverTools.${index}`, issues),
  );
}

function readHostContext(candidate: unknown, issues: SettingsIssue[]): Settings["hostContext"] {
  const value = readObject(candidate, "hostContext", issues);
  return {
    enabled: readRequiredBoolean(value["enabled"], "hostContext.enabled", issues),
    maxSerializedBytes: readRequiredPositiveInteger(
      value["maxSerializedBytes"],
      "hostContext.maxSerializedBytes",
      issues,
    ),
    maxStringLength: readRequiredPositiveInteger(
      value["maxStringLength"],
      "hostContext.maxStringLength",
      issues,
    ),
    maxMetadataDepth: readRequiredPositiveInteger(
      value["maxMetadataDepth"],
      "hostContext.maxMetadataDepth",
      issues,
    ),
    maxMetadataEntries: readRequiredPositiveInteger(
      value["maxMetadataEntries"],
      "hostContext.maxMetadataEntries",
      issues,
    ),
  };
}

function readTimeouts(candidate: unknown, issues: SettingsIssue[]): Settings["timeouts"] {
  const value = readObject(candidate, "timeouts", issues);
  return {
    queueMs: readRequiredPositiveInteger(value["queueMs"], "timeouts.queueMs", issues),
    providerMs: readRequiredPositiveInteger(value["providerMs"], "timeouts.providerMs", issues),
    clientToolMs: readRequiredPositiveInteger(
      value["clientToolMs"],
      "timeouts.clientToolMs",
      issues,
    ),
  };
}

function readAgent(candidate: unknown, issues: SettingsIssue[]): Settings["agent"] {
  const value = readObject(candidate, "agent", issues);
  return {
    instructions: readRequiredString(value["instructions"], "agent.instructions", issues),
    maxSteps: readRequiredPositiveInteger(value["maxSteps"], "agent.maxSteps", issues),
  };
}

function readPersistence(candidate: unknown, issues: SettingsIssue[]): Settings["persistence"] {
  const value = readObject(candidate, "persistence", issues);
  const databaseUrl = readOptionalString(value["databaseUrl"], "persistence.databaseUrl", issues);
  return databaseUrl === undefined ? {} : { databaseUrl };
}

function readKeepalive(candidate: unknown, issues: SettingsIssue[]): Settings["keepalive"] {
  const value = readObject(candidate, "keepalive", issues);
  return {
    intervalMs: readRequiredPositiveInteger(value["intervalMs"], "keepalive.intervalMs", issues),
  };
}

function readTelemetry(candidate: unknown, issues: SettingsIssue[]): Settings["telemetry"] {
  const value = readObject(candidate, "telemetry", issues);
  const mode = value["mode"];
  if (mode === TELEMETRY_MODES.OFF || mode === TELEMETRY_MODES.CONSOLE) return { mode };
  if (mode === TELEMETRY_MODES.OTLP) {
    return {
      mode,
      endpoint: readRequiredString(value["endpoint"], "telemetry.endpoint", issues),
      serviceName: readRequiredString(value["serviceName"], "telemetry.serviceName", issues),
    };
  }
  issues.push({
    path: "telemetry.mode",
    message: `must be one of: ${TELEMETRY_MODE_VALUES.join(", ")}`,
  });
  return { mode: TELEMETRY_MODES.OFF };
}

function readWorkflow(candidate: unknown, issues: SettingsIssue[]): Settings["workflow"] {
  const value = readObject(candidate, "workflow", issues);
  return {
    workerConcurrency: readRequiredPositiveInteger(
      value["workerConcurrency"],
      "workflow.workerConcurrency",
      issues,
    ),
    maxPoolSize: readRequiredPositiveInteger(value["maxPoolSize"], "workflow.maxPoolSize", issues),
    journalPruneAfterDays: readRequiredPositiveInteger(
      value["journalPruneAfterDays"],
      "workflow.journalPruneAfterDays",
      issues,
    ),
    journalSweepIntervalMs: readRequiredPositiveInteger(
      value["journalSweepIntervalMs"],
      "workflow.journalSweepIntervalMs",
      issues,
    ),
    journalClass: readRequiredCatalogValue(
      value["journalClass"],
      "workflow.journalClass",
      WORKFLOW_JOURNAL_CLASS_VALUES,
      WORKFLOW_JOURNAL_CLASSES.OPERATIONAL,
      issues,
    ),
    postgresUrl: readOptionalString(value["postgresUrl"], "workflow.postgresUrl", issues),
  };
}
