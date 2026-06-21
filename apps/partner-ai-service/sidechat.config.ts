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
  HISTORY_CONTEXT_MODES,
  OUTPUT_FORMATS,
  REQUEST_POLICY_MODES,
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
} from "#config/service-config";

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
    databaseUrl: readEnv.secret(SERVICE_ENV_KEYS.databaseUrl, {
      description: "Postgres URL used by durable production persistence.",
    }),
    demoSeedConversations: readEnv.boolean(SERVICE_ENV_KEYS.demoSeedConversations, {
      defaultValue: false,
      description: "Whether local boot seeds deterministic demo conversations.",
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
        summary: PROVIDERS.OPENAI.REASONING_SUMMARIES.AUTO,
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
} satisfies SideChatConfig);

export default sideChatConfig;
