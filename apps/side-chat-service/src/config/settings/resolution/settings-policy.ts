import { OPENAI_PROVIDER } from "../../providers/openai-provider-config.js";
import { SCRIPTED_PROVIDER } from "../../providers/scripted-provider-config.js";
import { AUTH_PROFILES } from "../../declaration/side-chat-config.js";
import type { SettingsIssue } from "../setting-readers.js";
import type { Settings } from "./settings-contract.js";

export type SettingsValidationCatalogs = Readonly<{
  registeredServerToolNames: readonly string[];
}>;

export const WORKFLOW_CAPACITY_HEADROOM = 4;
const MIN_WORKFLOW_POSTGRES_POOL_SIZE = 10;

/** Apply relationships that cannot be validated while decoding one field. */
export function validateSettingsPolicy(
  settings: Settings,
  issues: SettingsIssue[],
  catalogs: SettingsValidationCatalogs,
): void {
  addLessThanIssue(
    settings.timeouts.clientToolMs,
    settings.timeouts.providerMs,
    "timeouts.clientToolMs",
    "provider timeout",
    issues,
  );
  validateActivityStreamCapacity(settings, issues);
  validateDeploymentProvider(settings, issues);
  validateWorkflowCapacity(settings, issues);
  validateModelCatalog(settings, issues);
  validateServerTools(settings.serverTools, catalogs.registeredServerToolNames, issues);
  validateMaintenanceDatabase(settings, issues);
}

function validateDeploymentProvider(settings: Settings, issues: SettingsIssue[]): void {
  if (
    settings.auth.profile !== AUTH_PROFILES.PRODUCTION ||
    settings.models.provider !== SCRIPTED_PROVIDER.KIND
  ) {
    return;
  }
  issues.push({
    path: "models.provider",
    message: "must use a production provider with the production auth profile",
  });
}

function validateActivityStreamCapacity(settings: Settings, issues: SettingsIssue[]): void {
  if (settings.capacity.maxActivityStreamsPerSubject <= settings.capacity.maxActivityStreams) {
    return;
  }
  issues.push({
    path: "capacity.maxActivityStreamsPerSubject",
    message: "must not exceed capacity.maxActivityStreams",
  });
}

function validateWorkflowCapacity(settings: Settings, issues: SettingsIssue[]): void {
  const minimumWorkerConcurrency = settings.capacity.maxActiveTurns + WORKFLOW_CAPACITY_HEADROOM;
  if (settings.workflow.workerConcurrency < minimumWorkerConcurrency) {
    issues.push({
      path: "workflow.workerConcurrency",
      message: `must be at least capacity.maxActiveTurns + ${WORKFLOW_CAPACITY_HEADROOM} worker headroom (${minimumWorkerConcurrency})`,
    });
  }

  const minimumPoolSize = Math.max(
    MIN_WORKFLOW_POSTGRES_POOL_SIZE,
    settings.workflow.workerConcurrency + 2,
  );
  if (settings.workflow.maxPoolSize < minimumPoolSize) {
    issues.push({
      path: "workflow.maxPoolSize",
      message: `must be at least max(10, workflow.workerConcurrency + 2) (${minimumPoolSize})`,
    });
  }
}

function validateModelCatalog(settings: Settings, issues: SettingsIssue[]): void {
  const models = settings.models.availableModels;
  if (models.length === 0) {
    issues.push({
      path: "models.availableModels",
      message: "must contain at least one model",
    });
    return;
  }
  const ids = models.map((model) => model.id);
  if (new Set(ids).size !== ids.length) {
    issues.push({
      path: "models.availableModels",
      message: "must not contain duplicate model ids",
    });
  }
  if (!ids.includes(settings.models.defaultModelId)) {
    issues.push({
      path: "models.defaultModelId",
      message: "must name an available model",
    });
  }
  if (settings.models.provider !== OPENAI_PROVIDER.KIND) return;
  settings.models.availableModels.forEach((model, index) => {
    const reasoning = model.reasoning;
    if (reasoning === undefined) return;
    if (reasoning.efforts.length === 0) {
      issues.push({
        path: `models.availableModels.${index}.reasoning.efforts`,
        message: "must contain at least one effort",
      });
    }
    if (new Set(reasoning.efforts).size !== reasoning.efforts.length) {
      issues.push({
        path: `models.availableModels.${index}.reasoning.efforts`,
        message: "must not contain duplicates",
      });
    }
    if (!reasoning.efforts.includes(reasoning.defaultEffort)) {
      issues.push({
        path: `models.availableModels.${index}.reasoning.defaultEffort`,
        message: "must be one of the model's available efforts",
      });
    }
  });
}

function validateServerTools(
  selected: readonly string[],
  registered: readonly string[],
  issues: SettingsIssue[],
): void {
  if (new Set(selected).size !== selected.length) {
    issues.push({
      path: "serverTools",
      message: "must not contain duplicate names",
    });
  }
  const registeredNames = new Set(registered);
  const unknown = selected.filter((name) => !registeredNames.has(name));
  if (unknown.length > 0) {
    issues.push({
      path: "serverTools",
      message: "contains an unregistered server tool",
    });
  }
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
