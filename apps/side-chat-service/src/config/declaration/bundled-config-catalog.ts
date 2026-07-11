import { SERVICE_ENV_KEYS, type ServiceEnv, type SideChatConfig } from "./side-chat-config.js";
import azureConfig from "../../../sidechat.azure.config.js";
import defaultConfig from "../../../sidechat.config.js";
import fakeConfig from "../../../sidechat.fake.config.js";

const CONFIGS: Readonly<Record<string, SideChatConfig>> = {
  default: defaultConfig,
  fake: fakeConfig,
  azure: azureConfig,
};

export function loadSideChatConfig(env: ServiceEnv): SideChatConfig {
  const name = env[SERVICE_ENV_KEYS.CONFIG_NAME]?.trim() || "default";
  const config = CONFIGS[name];
  if (config) return config;
  throw new Error(
    `${SERVICE_ENV_KEYS.CONFIG_NAME} must be one of ${Object.keys(CONFIGS).join(", ")}`,
  );
}
