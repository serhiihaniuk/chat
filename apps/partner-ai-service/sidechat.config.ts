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

const sideChatConfig = defineSideChatConfig({
  environment: {
    port: readEnv.number(SERVICE_ENV_KEYS.port, {
      defaultValue: DEFAULT_SERVICE_PORT,
      description: "HTTP port for the partner-ai-service Node server.",
    }),
    profile: readEnv(SERVICE_ENV_KEYS.profile, {
      defaultValue: SERVICE_PROFILES.PRODUCTION,
      description: "Deployment posture used by auth, policy, and persistence adapters.",
    }),
    authBearerToken: readEnv.secret(SERVICE_ENV_KEYS.authBearerToken, {
      description: "Trusted bearer token accepted by the production service auth adapter.",
    }),
    databaseUrl: readEnv.optional(SERVICE_ENV_KEYS.databaseUrl, {
      description: "Postgres URL used by durable production persistence.",
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
      kind: PROVIDERS.OPENAI.KIND,
      connection: {
        apiKey: readEnv.secret(PROVIDERS.OPENAI.SECRET_ENV_KEYS.API_KEY, {
          description: "Secret API key for the OpenAI-compatible Responses provider.",
        }),
        endpoint: readEnv.optional(PROVIDERS.OPENAI.TRANSPORT_ENV_KEYS.BASE_URL, {
          description: "Optional OpenAI-compatible endpoint override, such as a gateway URL.",
        }),
      },
      reasoning: {
        summary: PROVIDERS.OPENAI.REASONING_SUMMARIES.CONCISE,
      },
    },
    default: {
      model: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI,
      reasoning: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.MEDIUM,
    } satisfies SideChatDefaultModel<typeof PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI>,
    availableModels: [
      {
        model: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI,
        reasoning: {
          default: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.MEDIUM,
          options: [
            PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.LOW,
            PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.MEDIUM,
            PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.HIGH,
          ],
        },
      } satisfies SideChatConfiguredModel<typeof PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI>,
      {
        model: PROVIDERS.OPENAI.MODELS.GPT_5_5,
        reasoning: {
          default: PROVIDERS.OPENAI.MODELS.GPT_5_5.REASONING.MEDIUM,
          options: [
            PROVIDERS.OPENAI.MODELS.GPT_5_5.REASONING.LOW,
            PROVIDERS.OPENAI.MODELS.GPT_5_5.REASONING.MEDIUM,
            PROVIDERS.OPENAI.MODELS.GPT_5_5.REASONING.HIGH,
          ],
        },
      } satisfies SideChatConfiguredModel<typeof PROVIDERS.OPENAI.MODELS.GPT_5_5>,
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
          resultCount: TOOLS.MOCK_WEB_SEARCH.PARAMETERS.DEFAULT_RESULT_COUNT,
          searchModelId: TOOLS.MOCK_WEB_SEARCH.PARAMETERS.DEFAULT_SEARCH_MODEL_ID,
          searchAgentPrompt: TOOLS.MOCK_WEB_SEARCH.PARAMETERS.DEFAULT_SEARCH_AGENT_PROMPT,
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
    mode: REQUEST_POLICY_MODES.CONFIGURED,
    modelEntitlements: {
      modelIds: [
        PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.MODEL_ID,
        PROVIDERS.OPENAI.MODELS.GPT_5_5.MODEL_ID,
      ],
    },
  },
  chat: {
    turnProfile: {
      id: CONFIG_IDS.TURN_PROFILES.DEFAULT,
      version: "2026-06-20",
      displayName: "Default profile",
      executor: EXECUTORS.AI_SDK_TOOL_LOOP,
      systemInstructions: [
        "Render final assistant answers as GitHub-flavored Markdown.",
        "Use bullet or numbered lists when the answer contains multiple items.",
        "Preserve emphasis with Markdown syntax.",
        "Keep tool payload JSON out of the visible answer unless the user explicitly asks for raw data.",
        "When your answer draws on specific, nameable sources, cite them with GitHub-flavored Markdown footnotes: put a [^1], [^2], … marker (numbered sequentially) right after the claim it supports, and define each once at the very end as '[^1]: Source title — https://url — \"a short exact quote from the source\"'. Add the quote whenever you can and keep it to one sentence. Only cite real sources you can name; never invent a citation or a quote, and define every marker you use.",
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
        "Window (ms) to coalesce streamed text and reasoning deltas; lower is smoother, higher emits fewer events.",
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

export default sideChatConfig;
