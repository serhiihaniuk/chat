import {
  DEFAULT_FAKE_REASONING_EFFORT,
  FAKE_ECHO_MODEL_ID,
  FAKE_PROVIDER_ID,
  FAKE_REASONING_EFFORTS,
  OPENAI_PROVIDER_ID,
  OPENAI_REASONING_EFFORTS,
  OPENAI_REASONING_SUMMARIES,
  type OpenAIReasoningEffort,
} from "@side-chat/agent-runtime";
import {
  SERVICE_MODEL_RETENTION_POLICIES,
  type ServiceModelRetentionPolicy,
} from "#composition/providers/service-provider-registry";
import type { RuntimeModelMetadata } from "#composition/service-composition-types";

/**
 * Provider and model catalog for service-readable configuration.
 *
 * Provider ids come from `agent-runtime`; model entries add the service-visible
 * metadata and per-model reasoning options needed by `/models` and future
 * `sidechat.config.ts`. Transport secrets are named here only as env keys; the
 * actual secret values stay in deployment env and never enter diagnostics.
 */

type ObjectValue<T extends Readonly<Record<string, string>>> = T[keyof T];

export const PROVIDER_KINDS = {
  FAKE: "fake",
  OPENAI: "openai",
} as const;

export type ProviderKind = ObjectValue<typeof PROVIDER_KINDS>;

const FAKE_REASONING_OPTIONS = [
  FAKE_REASONING_EFFORTS.LOW,
  FAKE_REASONING_EFFORTS.MEDIUM,
  FAKE_REASONING_EFFORTS.HIGH,
] as const;

const OPENAI_REASONING_OPTIONS = [
  OPENAI_REASONING_EFFORTS.NONE,
  OPENAI_REASONING_EFFORTS.MINIMAL,
  OPENAI_REASONING_EFFORTS.LOW,
  OPENAI_REASONING_EFFORTS.MEDIUM,
  OPENAI_REASONING_EFFORTS.HIGH,
  OPENAI_REASONING_EFFORTS.XHIGH,
] as const satisfies readonly OpenAIReasoningEffort[];

const OPENAI_MODELS = {
  GPT_5_4_MINI: {
    MODEL_ID: "gpt-5.4-mini",
    DISPLAY_NAME: "GPT-5.4 mini",
    CONTEXT_WINDOW_TOKENS: 400_000,
    MAX_OUTPUT_TOKENS: 128_000,
    REASONING: OPENAI_REASONING_EFFORTS,
    DEFAULT_REASONING_EFFORT: OPENAI_REASONING_EFFORTS.MEDIUM,
    SUPPORTED_REASONING_EFFORTS: OPENAI_REASONING_OPTIONS,
  },
  GPT_5_5: {
    MODEL_ID: "gpt-5.5",
    DISPLAY_NAME: "GPT-5.5",
    CONTEXT_WINDOW_TOKENS: 1_000_000,
    MAX_OUTPUT_TOKENS: 128_000,
    REASONING: OPENAI_REASONING_EFFORTS,
    DEFAULT_REASONING_EFFORT: OPENAI_REASONING_EFFORTS.MEDIUM,
    SUPPORTED_REASONING_EFFORTS: OPENAI_REASONING_OPTIONS,
  },
} as const;

export const PROVIDERS = {
  FAKE: {
    KIND: PROVIDER_KINDS.FAKE,
    PROVIDER_ID: FAKE_PROVIDER_ID,
    MODELS: {
      FAKE_ECHO: {
        MODEL_ID: FAKE_ECHO_MODEL_ID,
        DISPLAY_NAME: "Fake Echo",
        REASONING: FAKE_REASONING_EFFORTS,
        DEFAULT_REASONING_EFFORT: DEFAULT_FAKE_REASONING_EFFORT,
        SUPPORTED_REASONING_EFFORTS: FAKE_REASONING_OPTIONS,
      },
    },
  },
  OPENAI: {
    KIND: PROVIDER_KINDS.OPENAI,
    PROVIDER_ID: OPENAI_PROVIDER_ID,
    SECRET_ENV_KEYS: {
      API_KEY: "SIDECHAT_OPENAI_API_KEY",
    },
    TRANSPORT_ENV_KEYS: {
      BASE_URL: "SIDECHAT_OPENAI_BASE_URL",
    },
    DEFAULT_RETENTION: SERVICE_MODEL_RETENTION_POLICIES.NO_RETENTION,
    REASONING_SUMMARIES: OPENAI_REASONING_SUMMARIES,
    MODELS: OPENAI_MODELS,
  },
} as const;

export type OpenAIServiceModel =
  (typeof PROVIDERS.OPENAI.MODELS)[keyof typeof PROVIDERS.OPENAI.MODELS];
export type OpenAIModelId = OpenAIServiceModel["MODEL_ID"];

export const OPENAI_MODEL_METADATA_BY_ID: Readonly<Record<OpenAIModelId, RuntimeModelMetadata>> = {
  [OPENAI_MODELS.GPT_5_4_MINI.MODEL_ID]: toRuntimeModelMetadata(OPENAI_MODELS.GPT_5_4_MINI),
  [OPENAI_MODELS.GPT_5_5.MODEL_ID]: toRuntimeModelMetadata(OPENAI_MODELS.GPT_5_5),
};

export const readOpenAIModelMetadata = (modelId: string): RuntimeModelMetadata | undefined =>
  isOpenAIModelId(modelId) ? OPENAI_MODEL_METADATA_BY_ID[modelId] : undefined;

export const DEFAULT_OPENAI_RETENTION_POLICY = PROVIDERS.OPENAI
  .DEFAULT_RETENTION satisfies ServiceModelRetentionPolicy;

const isOpenAIModelId = (modelId: string): modelId is OpenAIModelId =>
  modelId in OPENAI_MODEL_METADATA_BY_ID;

function toRuntimeModelMetadata(model: OpenAIServiceModel): RuntimeModelMetadata {
  return {
    modelId: model.MODEL_ID,
    displayName: model.DISPLAY_NAME,
    contextWindowTokens: model.CONTEXT_WINDOW_TOKENS,
    maxOutputTokens: model.MAX_OUTPUT_TOKENS,
  };
}
