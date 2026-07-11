import {
  formatSettingsIssues,
  validateSettings,
} from "#application/configuration/resolve-settings";
import { loadSideChatConfig } from "#adapters/configuration/bundled-config-catalog";
import { readServiceMode } from "#adapters/configuration/process-environment";
import { resolveConfigEnvironment } from "#adapters/configuration/resolve-config-environment";
import type { ServiceEnv } from "#ports/configuration/side-chat-config";

import { startProductionService } from "./compositions/production.js";
import { startTestingService } from "./compositions/testing.js";

export async function bootService(env: ServiceEnv) {
  const config = loadSideChatConfig(env);
  const resolvedConfig = resolveConfigEnvironment(config, env);
  const settingsResult = validateSettings(resolvedConfig.value);
  const issues = [...resolvedConfig.issues, ...(settingsResult.ok ? [] : settingsResult.issues)];
  if (!settingsResult.ok || issues.length > 0) {
    throw new Error(`Service configuration is invalid:\n${formatSettingsIssues(issues)}`);
  }

  const mode = readServiceMode(env);
  return mode.useTestComposition
    ? startTestingService(settingsResult.settings)
    : startProductionService(settingsResult.settings);
}
