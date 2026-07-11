import { loadSideChatConfig } from "#config/declaration/bundled-config-catalog";
import type { ServiceEnv } from "#config/declaration/side-chat-config";
import { resolveConfigEnvironment } from "#config/environment/resolve-config-environment";
import { formatSettingsIssues, validateSettings } from "#config/settings/resolve-settings";

/** Resolve one bundled declaration through the shared secret-safe validation boundary. */
export function resolveServiceSettings(env: ServiceEnv) {
  const config = loadSideChatConfig(env);
  const resolvedConfig = resolveConfigEnvironment(config, env);
  const settingsResult = validateSettings(resolvedConfig.value);
  const issues = [...resolvedConfig.issues, ...(settingsResult.ok ? [] : settingsResult.issues)];
  if (!settingsResult.ok || issues.length > 0) {
    throw new Error(`Service configuration is invalid:\n${formatSettingsIssues(issues)}`);
  }
  return settingsResult.settings;
}
