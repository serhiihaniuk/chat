import {
  AUTH_PROFILES,
  defineSideChatConfig,
  TELEMETRY_MODES,
  WORKFLOW_JOURNAL_CLASSES,
  type SideChatConfig,
} from "../declaration/side-chat-config.js";
import { SCRIPTED_PROVIDER } from "../providers/scripted-provider-config.js";

type ConfigOverrides = Omit<
  Partial<{
    [Key in keyof SideChatConfig]: Partial<SideChatConfig[Key]>;
  }>,
  "conversationTitle" | "models" | "serverTools" | "telemetry"
> & {
  readonly models?: SideChatConfig["models"];
  readonly conversationTitle?: Partial<SideChatConfig["conversationTitle"]>;
  readonly serverTools?: SideChatConfig["serverTools"];
  readonly telemetry?: SideChatConfig["telemetry"];
};

export function createDefaultConfig(overrides: ConfigOverrides = {}): SideChatConfig {
  const defaults: SideChatConfig = {
    models: {
      provider: SCRIPTED_PROVIDER.KIND,
      defaultModelId: SCRIPTED_PROVIDER.MODELS.COMPLETE.MODEL_ID,
      availableModels: [
        {
          id: SCRIPTED_PROVIDER.MODELS.COMPLETE.MODEL_ID,
          contextWindowTokens: SCRIPTED_PROVIDER.MODELS.COMPLETE.CONTEXT_WINDOW_TOKENS,
        },
      ],
    },
    conversationTitle: {
      modelId: SCRIPTED_PROVIDER.MODELS.TITLE.MODEL_ID,
      timeoutMs: 10_000,
    },
    serverTools: [],
    auth: {
      profile: AUTH_PROFILES.DEVELOPMENT,
      bearerToken: "local-test-token",
      workspaceId: "local-workspace",
    },
    timeouts: {
      queueMs: 5_000,
      providerMs: 45_000,
      clientToolMs: 30_000,
    },
    agent: {
      instructions: "You are a concise Side Chat assistant.",
      maxSteps: 8,
    },
    persistence: { databaseUrl: undefined },
    keepalive: { intervalMs: 15_000 },
    telemetry: { mode: TELEMETRY_MODES.OFF },
    workflow: {
      journalPruneAfterDays: 30,
      journalSweepIntervalMs: 3_600_000,
      journalClass: WORKFLOW_JOURNAL_CLASSES.OPERATIONAL,
      postgresUrl: undefined,
    },
  };
  return defineSideChatConfig({
    models: overrides.models ?? defaults.models,
    conversationTitle: {
      ...defaults.conversationTitle,
      ...overrides.conversationTitle,
    },
    serverTools: overrides.serverTools ?? defaults.serverTools,
    auth: { ...defaults.auth, ...overrides.auth },
    timeouts: { ...defaults.timeouts, ...overrides.timeouts },
    agent: { ...defaults.agent, ...overrides.agent },
    persistence: { ...defaults.persistence, ...overrides.persistence },
    keepalive: { ...defaults.keepalive, ...overrides.keepalive },
    telemetry: overrides.telemetry ?? defaults.telemetry,
    workflow: { ...defaults.workflow, ...overrides.workflow },
  });
}
