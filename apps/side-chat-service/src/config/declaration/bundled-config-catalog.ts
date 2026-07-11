import { SERVICE_ENV_KEYS, type ServiceEnv, type SideChatConfig } from "./side-chat-config.js";
import azureConfig from "../../../sidechat.azure.config.js";
import defaultConfig from "../../../sidechat.config.js";
import fakeConfig from "../../../sidechat.fake.config.js";

export const BUNDLED_CONFIG_NAMES = {
  DEFAULT: "default",
  FAKE: "fake",
  AZURE: "azure",
} as const;

const CONFIGS: Readonly<Record<string, SideChatConfig>> = {
  [BUNDLED_CONFIG_NAMES.DEFAULT]: defaultConfig,
  [BUNDLED_CONFIG_NAMES.FAKE]: fakeConfig,
  [BUNDLED_CONFIG_NAMES.AZURE]: azureConfig,
};

export function loadSideChatConfig(env: ServiceEnv): SideChatConfig {
  const configuredName = env[SERVICE_ENV_KEYS.CONFIG_NAME]?.trim();
  const name = configuredName ?? BUNDLED_CONFIG_NAMES.DEFAULT;
  const config = CONFIGS[name];
  if (config) return config;
  throw new Error(
    `${SERVICE_ENV_KEYS.CONFIG_NAME} must be one of ${Object.keys(CONFIGS).join(", ")}`,
  );
}
