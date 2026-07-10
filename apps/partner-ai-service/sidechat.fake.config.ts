import {
  defineSideChatConfig,
  readEnv,
  type SideChatConfig,
  type SideChatConfiguredModel,
  type SideChatDefaultModel,
} from "#config/sidechat-config";
import {
  CONFIG_IDS,
  CONTEXT_ADMISSION_POLICIES,
  DEFAULT_INSTANCE_ID,
  HISTORY_CONTEXT_MODES,
  OUTPUT_FORMATS,
  REQUEST_POLICY_MODES,
  RESUMABILITY_DEFAULTS,
  SAFETY_POLICIES,
  SERVICE_PROFILES,
  TOOL_DEFAULT_EXPOSURE,
  TOOL_POLICY_MODES,
} from "#config/catalog/config-values";
import { AUXILIARY_JOBS } from "#config/catalog/capabilities/auxiliary-jobs";
import { EXECUTORS } from "#config/catalog/capabilities/executors";
import { TOOLS } from "#config/catalog/capabilities/tools";
import { PROVIDERS } from "#config/catalog/providers";
import {
  DEFAULT_SERVICE_PORT,
  DEFAULT_TENANT_ID,
  DEFAULT_WORKSPACE_ID,
  SERVICE_ENV_KEYS,
} from "#config/env/service-env-contract";

/**
 * Standalone fake-provider + in-memory service config: the no-secrets boot.
 *
 * A full self-contained `SideChatConfig` for local development, demos, and the
 * browser e2e harness: the deterministic fake showcase model needs no API key,
 * and persistence is in-memory because the development profile with no
 * `SIDECHAT_DATABASE_URL` selects the process-local repositories. Boot it by
 * pointing `SIDECHAT_CONFIG_PATH` here (the local launcher and Playwright do).
 */
const sideChatFakeConfig = defineSideChatConfig({
  environment: {
    port: readEnv.number(SERVICE_ENV_KEYS.port, {
      defaultValue: DEFAULT_SERVICE_PORT,
      description: "HTTP port for the partner-ai-service Node server.",
    }),
    profile: readEnv(SERVICE_ENV_KEYS.profile, {
      defaultValue: SERVICE_PROFILES.DEVELOPMENT,
      description: "Development posture; the fake provider refuses production boots.",
    }),
    authBearerToken: readEnv.secret(SERVICE_ENV_KEYS.authBearerToken, {
      required: false,
      description: "Optional bearer token; development accepts a local token.",
    }),
    databaseUrl: readEnv.secret(SERVICE_ENV_KEYS.databaseUrl, {
      required: false,
      description: "Left unset on purpose: absence selects in-memory persistence.",
    }),
    databasePool: {
      max: readEnv.number(SERVICE_ENV_KEYS.databasePoolMax, {
        description: "Max pooled Postgres connections (node-postgres default: 10).",
      }),
      idleTimeoutMillis: readEnv.number(SERVICE_ENV_KEYS.databasePoolIdleTimeoutMs, {
        description: "Idle-connection timeout in ms before the pool releases it.",
      }),
      connectionTimeoutMillis: readEnv.number(SERVICE_ENV_KEYS.databasePoolConnectionTimeoutMs, {
        description: "Timeout in ms to acquire a new pooled connection before failing.",
      }),
      ssl: readEnv.boolean(SERVICE_ENV_KEYS.databasePoolSsl, {
        description: "Enable TLS for the query pool (managed Postgres).",
      }),
    },
    demoSeedConversations: readEnv.boolean(SERVICE_ENV_KEYS.demoSeedConversations, {
      defaultValue: false,
      description: "Whether local boot seeds deterministic demo conversations.",
    }),
    logLevel: readEnv(SERVICE_ENV_KEYS.logLevel, {
      defaultValue: "info",
      description: "Minimum diagnostic log level: debug | info | warn | error.",
    }),
    logFormat: readEnv.optional(SERVICE_ENV_KEYS.logFormat, {
      description:
        "Diagnostic output format: pretty | json (default: pretty in development, json in production).",
    }),
    tenantId: readEnv(SERVICE_ENV_KEYS.tenantId, {
      defaultValue: DEFAULT_TENANT_ID,
      description: "Default workspace tenant id used by service adapters.",
    }),
    workspaceId: readEnv(SERVICE_ENV_KEYS.workspaceId, {
      defaultValue: DEFAULT_WORKSPACE_ID,
      description: "Default workspace id used by service adapters.",
    }),
  },
  models: {
    provider: {
      kind: PROVIDERS.FAKE.KIND,
    },
    default: {
      model: PROVIDERS.FAKE.MODELS.FAKE_ECHO,
      reasoning: PROVIDERS.FAKE.MODELS.FAKE_ECHO.REASONING.MEDIUM,
    } satisfies SideChatDefaultModel<typeof PROVIDERS.FAKE.MODELS.FAKE_ECHO>,
    availableModels: [
      {
        model: PROVIDERS.FAKE.MODELS.FAKE_ECHO,
        reasoning: {
          default: PROVIDERS.FAKE.MODELS.FAKE_ECHO.REASONING.MEDIUM,
          options: [
            PROVIDERS.FAKE.MODELS.FAKE_ECHO.REASONING.LOW,
            PROVIDERS.FAKE.MODELS.FAKE_ECHO.REASONING.MEDIUM,
            PROVIDERS.FAKE.MODELS.FAKE_ECHO.REASONING.HIGH,
          ],
        },
      } satisfies SideChatConfiguredModel<typeof PROVIDERS.FAKE.MODELS.FAKE_ECHO>,
    ],
  },
  executors: {
    availableExecutors: [EXECUTORS.AI_SDK_TOOL_LOOP],
    default: EXECUTORS.AI_SDK_TOOL_LOOP,
  },
  tools: {
    availableTools: [
      {
        tool: TOOLS.MOCK_WEB_SEARCH,
        modelPrompt: {
          usageInstructions: TOOLS.MOCK_WEB_SEARCH.MODEL_PROMPT.USAGE_INSTRUCTIONS,
        },
        parameters: {
          delayMs: TOOLS.MOCK_WEB_SEARCH.PARAMETERS.DEFAULT_DELAY_MS,
        },
        exposure: {
          defaultMode: TOOL_DEFAULT_EXPOSURE.ENABLED,
          approvalPolicyIds: TOOLS.MOCK_WEB_SEARCH.EXPOSURE.APPROVAL_POLICY_IDS,
        },
      },
    ],
  },
  hostCommands: {
    availableCommands: [],
    approvalPolicies: [],
    activityRenderers: [],
  },
  turnGuards: {
    availableGuards: [],
  },
  requestPolicy: {
    mode: REQUEST_POLICY_MODES.ALLOW_ALL,
    modelEntitlements: {
      modelIds: [PROVIDERS.FAKE.MODELS.FAKE_ECHO.MODEL_ID],
    },
  },
  chat: {
    turnProfile: {
      id: CONFIG_IDS.TURN_PROFILES.DEFAULT,
      version: "2026-07-02",
      displayName: "Default profile",
      executor: EXECUTORS.AI_SDK_TOOL_LOOP,
      systemInstructions: [
        "Render final assistant answers as GitHub-flavored Markdown.",
        "Use bullet or numbered lists when the answer contains multiple items.",
        "Preserve emphasis with Markdown syntax.",
        "Keep tool payload JSON out of the visible answer unless the user explicitly asks for raw data.",
      ],
      output: { format: OUTPUT_FORMATS.MARKDOWN },
      tools: {
        mode: TOOL_POLICY_MODES.PROFILE_ALLOWLIST,
        names: [TOOLS.MOCK_WEB_SEARCH.NAME],
      },
      safety: {
        policyId: SAFETY_POLICIES.STANDARD.ID,
        promptInjectionMode: SAFETY_POLICIES.STANDARD.DEFAULT_PROMPT_INJECTION_MODE,
        turnGuardIds: [],
      },
    },
  },
  context: {
    history: {
      mode: HISTORY_CONTEXT_MODES.RECENT_MESSAGES,
      maxMessages: 12,
      maxTokens: 4_000,
    },
    contextAdmission: {
      policyId: CONTEXT_ADMISSION_POLICIES.DETERMINISTIC_V1,
      maxInputTokens: 24_000,
      reservedOutputTokens: 4_000,
      maxHistoryTokens: 4_000,
    },
  },
  auxiliaryModelJobs: {
    availableJobs: [
      {
        job: AUXILIARY_JOBS.CONVERSATION_TITLE,
        mode: AUXILIARY_JOBS.CONVERSATION_TITLE.MODES.ENABLED,
        prompt: AUXILIARY_JOBS.CONVERSATION_TITLE.DEFAULT_PROMPT,
      },
    ],
  },
  history: {
    turnActivity: readEnv(SERVICE_ENV_KEYS.turnActivityHistory, {
      defaultValue: "full",
      description:
        'Whether completed turns store their activity trace (reasoning, tool calls) with the message so history reads replay it: "full" or "disabled".',
    }),
  },
  streaming: {
    outputDeltaFlushInterval: readEnv.number(SERVICE_ENV_KEYS.outputDeltaFlushIntervalMs, {
      defaultValue: RESUMABILITY_DEFAULTS.OUTPUT_DELTA_FLUSH_INTERVAL_MS,
      description:
        "Window (ms) to batch streamed text and reasoning deltas; lower is smoother, higher emits fewer events.",
    }),
  },
  resumability: {
    safetyPollInterval: readEnv.number(SERVICE_ENV_KEYS.safetyPollIntervalMs, {
      defaultValue: RESUMABILITY_DEFAULTS.SAFETY_POLL_INTERVAL_MS,
      description:
        "Per-subscriber reconcile-poll interval (ms) backstopping a missed Postgres NOTIFY.",
    }),
    instanceId: readEnv(SERVICE_ENV_KEYS.instanceId, {
      defaultValue: DEFAULT_INSTANCE_ID,
      description:
        "Stable per-process owner id written to owner_instance_id; set per replica in production.",
    }),
    leaseTtl: readEnv.number(SERVICE_ENV_KEYS.leaseTtlMs, {
      defaultValue: RESUMABILITY_DEFAULTS.LEASE_TTL_MS,
      description: "Owner lease window (ms); the reaper terminalizes a running turn past it.",
    }),
    heartbeatInterval: readEnv.number(SERVICE_ENV_KEYS.heartbeatIntervalMs, {
      defaultValue: RESUMABILITY_DEFAULTS.HEARTBEAT_INTERVAL_MS,
      description: "Owner lease renew cadence (ms); kept comfortably under the lease window.",
    }),
    reaperInterval: readEnv.number(SERVICE_ENV_KEYS.reaperIntervalMs, {
      defaultValue: RESUMABILITY_DEFAULTS.REAPER_INTERVAL_MS,
      description: "How often (ms) this instance sweeps expired-lease running turns.",
    }),
    reaperBatchLimit: readEnv.number(SERVICE_ENV_KEYS.reaperBatchLimit, {
      defaultValue: RESUMABILITY_DEFAULTS.REAPER_BATCH_LIMIT,
      description:
        "Max running turns one reaper sweep terminalizes, so a backlog drains gradually.",
    }),
    sseHeartbeatInterval: readEnv.number(SERVICE_ENV_KEYS.sseHeartbeatIntervalMs, {
      defaultValue: RESUMABILITY_DEFAULTS.SSE_HEARTBEAT_INTERVAL_MS,
      description:
        "SSE comment-keepalive cadence (ms) on the turn and activity streams, under the LB idle timeout.",
    }),
  },
} satisfies SideChatConfig);

export default sideChatFakeConfig;
