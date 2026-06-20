import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { ServiceConfigError } from "../../service-config-error.js";
import type { ServiceEnv, SideChatConfig } from "../types.js";

export const SIDECHAT_CONFIG_ENV_KEY = "SIDECHAT_CONFIG";
export const SIDECHAT_CONFIG_PATH_ENV_KEY = "SIDECHAT_CONFIG_PATH";
export const DEFAULT_SIDECHAT_CONFIG_NAME = "default";

export type SideChatConfigRegistry = Readonly<Record<string, SideChatConfig>>;

export type SideChatConfigModule = {
  readonly default?: SideChatConfig | undefined;
  readonly SIDECHAT_CONFIGS?: SideChatConfigRegistry | undefined;
};

export type SelectedSideChatConfig = {
  readonly name: string;
  readonly config: SideChatConfig;
};

export type SideChatConfigLoadResult =
  | { readonly loaded: true; readonly selection: SelectedSideChatConfig }
  | { readonly loaded: false; readonly reason: string };

export const selectSideChatConfig = (
  configModule: SideChatConfigModule,
  env: ServiceEnv = process.env,
): SelectedSideChatConfig => {
  const requestedName = readRequestedConfigName(env);
  const registry = readConfigRegistry(configModule);
  const configName = requestedName ?? DEFAULT_SIDECHAT_CONFIG_NAME;
  const config = registry[configName];
  if (config) return { name: configName, config };

  throw new ServiceConfigError(
    `${SIDECHAT_CONFIG_ENV_KEY} must be one of ${Object.keys(registry).join(", ")}.`,
  );
};

export const loadSelectedSideChatConfig = async (
  env: ServiceEnv = process.env,
): Promise<SideChatConfigLoadResult> => {
  const explicitConfigName = Boolean(readRequestedConfigName(env));
  try {
    const configModule = (await import(readConfigModuleUrl(env))) as SideChatConfigModule;
    return { loaded: true, selection: selectSideChatConfig(configModule, env) };
  } catch (error) {
    if (explicitConfigName) {
      throw new ServiceConfigError(`Unable to load sidechat.config.ts: ${errorMessage(error)}`);
    }

    return {
      loaded: false,
      reason: errorMessage(error),
    };
  }
};

const readConfigRegistry = (configModule: SideChatConfigModule): SideChatConfigRegistry => {
  if (configModule.SIDECHAT_CONFIGS) return configModule.SIDECHAT_CONFIGS;
  if (configModule.default) return { [DEFAULT_SIDECHAT_CONFIG_NAME]: configModule.default };

  throw new ServiceConfigError(
    "sidechat.config.ts must export SIDECHAT_CONFIGS or a default SideChatConfig.",
  );
};

const readRequestedConfigName = (env: ServiceEnv): string | undefined => {
  const value = env[SIDECHAT_CONFIG_ENV_KEY]?.trim();
  return value ? value : undefined;
};

const readConfigModuleUrl = (env: ServiceEnv): string => {
  const explicitPath = env[SIDECHAT_CONFIG_PATH_ENV_KEY]?.trim();
  if (explicitPath) return pathToFileURL(resolve(explicitPath)).href;

  return new URL("../../../../sidechat.config.ts", import.meta.url).href;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown error";
