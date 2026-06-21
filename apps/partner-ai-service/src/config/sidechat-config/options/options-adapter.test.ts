import { SIDECHAT_EVENT_TYPES, SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";
import sideChatConfig from "#sidechat-config";
import { createPartnerAiServiceApp } from "#inbound/http/app";
import { runTurnStream } from "#testing/turn-stream/turn-stream-harness.test-support";
import { EXECUTORS } from "#config/catalog/capabilities/executors";
import { TOOLS } from "#config/catalog/capabilities/tools";
import {
  HISTORY_CONTEXT_MODES,
  REQUEST_POLICY_MODES,
  SERVICE_PROFILES,
} from "#config/catalog/config-values";
import { PROVIDERS } from "#config/catalog/providers";
import {
  createPartnerAiServiceOptionsFromConfig,
  defineSideChatConfig,
  readEnv,
  type SideChatConfiguredModel,
} from "#config/sidechat-config";
import { SERVICE_ENV_KEYS } from "#config/service-config";

const validRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_sidechat_config_001",
  message: { id: "message_sidechat_config_001", content: "hello config" },
  hostContext: {
    schemaVersion: "host.v1",
    origin: "https://host.example",
  },
};

describe("sidechat.config.ts", () => {
  it("boots the production OpenAI service from the readable config", async () => {
    const options = createPartnerAiServiceOptionsFromConfig(sideChatConfig, {
      [SERVICE_ENV_KEYS.authBearerToken]: "prod-config-token",
      [SERVICE_ENV_KEYS.databaseUrl]: "postgres://sidechat:sidechat@localhost/sidechat",
      [PROVIDERS.OPENAI.SECRET_ENV_KEYS.API_KEY]: "key_123",
    });
    expect(options.runtime).toMatchObject({
      provider: PROVIDERS.OPENAI.KIND,
      defaultModelId: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.MODEL_ID,
      modelIds: [
        PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.MODEL_ID,
        PROVIDERS.OPENAI.MODELS.GPT_5_5.MODEL_ID,
      ],
    });
    expect(options.turnProfiles?.[0]).toMatchObject({
      executorId: EXECUTORS.AI_SDK_TOOL_LOOP.EXECUTOR_ID,
      toolPolicy: {
        allowedToolNames: [TOOLS.MOCK_WEB_SEARCH.NAME],
      },
    });

    const app = createPartnerAiServiceApp(options);
    const health = await app.request("/healthz");
    await expect(health.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      status: "ok",
      service: "partner-ai-service",
      authProfile: SERVICE_PROFILES.PRODUCTION,
      policyMode: REQUEST_POLICY_MODES.CONFIGURED,
      providerId: PROVIDERS.OPENAI.PROVIDER_ID,
      modelId: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.MODEL_ID,
      tools: {
        tools: [
          {
            name: TOOLS.MOCK_WEB_SEARCH.NAME,
            defaultEnabled: true,
            approvalPolicyIds: [],
          },
        ],
      },
    });

    const modelsResponse = await app.request("/models", {
      headers: { authorization: "Bearer prod-config-token" },
    });
    await expect(modelsResponse.json()).resolves.toMatchObject({
      defaultModel: {
        providerId: PROVIDERS.OPENAI.PROVIDER_ID,
        modelId: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.MODEL_ID,
      },
      models: [
        {
          providerId: PROVIDERS.OPENAI.PROVIDER_ID,
          modelId: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.MODEL_ID,
          displayName: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.DISPLAY_NAME,
          default: true,
          available: true,
          reasoning: {
            defaultEffort: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.MEDIUM,
            efforts: [
              PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.LOW,
              PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.MEDIUM,
              PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.HIGH,
            ],
          },
        },
        {
          providerId: PROVIDERS.OPENAI.PROVIDER_ID,
          modelId: PROVIDERS.OPENAI.MODELS.GPT_5_5.MODEL_ID,
          displayName: PROVIDERS.OPENAI.MODELS.GPT_5_5.DISPLAY_NAME,
          default: false,
          available: true,
          reasoning: {
            defaultEffort: PROVIDERS.OPENAI.MODELS.GPT_5_5.REASONING.MEDIUM,
            efforts: [
              PROVIDERS.OPENAI.MODELS.GPT_5_5.REASONING.LOW,
              PROVIDERS.OPENAI.MODELS.GPT_5_5.REASONING.MEDIUM,
              PROVIDERS.OPENAI.MODELS.GPT_5_5.REASONING.HIGH,
            ],
          },
        },
      ],
    });
  });

  it("streams through a test-only fake config app", async () => {
    const app = createPartnerAiServiceApp(
      createPartnerAiServiceOptionsFromConfig(createTestFakeConfig(), {
        [SERVICE_ENV_KEYS.authBearerToken]: "local-config-token",
        [SERVICE_ENV_KEYS.safetyPollIntervalMs]: "10",
      }),
    );

    const { events } = await runTurnStream(app, validRequest, "Bearer local-config-token");
    expect(events.at(-1)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.COMPLETED });
  });

  it("builds OpenAI runtime options from config plus secret env only", () => {
    const options = createPartnerAiServiceOptionsFromConfig(sideChatConfig, {
      [PROVIDERS.OPENAI.SECRET_ENV_KEYS.API_KEY]: "key_123",
      [SERVICE_ENV_KEYS.databaseUrl]: "postgres://sidechat:sidechat@localhost/sidechat",
      [SERVICE_ENV_KEYS.authBearerToken]: "prod-token",
    });

    expect(options.policies).toMatchObject({
      profile: SERVICE_PROFILES.PRODUCTION,
      mode: REQUEST_POLICY_MODES.CONFIGURED,
    });
    expect(options.runtime).toMatchObject({
      provider: PROVIDERS.OPENAI.KIND,
      apiKey: "key_123",
      modelIds: [
        PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.MODEL_ID,
        PROVIDERS.OPENAI.MODELS.GPT_5_5.MODEL_ID,
      ],
      defaultModelId: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.MODEL_ID,
      modelMetadata: [
        {
          modelId: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.MODEL_ID,
          displayName: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.DISPLAY_NAME,
          contextWindowTokens: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.CONTEXT_WINDOW_TOKENS,
          maxOutputTokens: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.MAX_OUTPUT_TOKENS,
        },
        {
          modelId: PROVIDERS.OPENAI.MODELS.GPT_5_5.MODEL_ID,
          displayName: PROVIDERS.OPENAI.MODELS.GPT_5_5.DISPLAY_NAME,
          contextWindowTokens: PROVIDERS.OPENAI.MODELS.GPT_5_5.CONTEXT_WINDOW_TOKENS,
          maxOutputTokens: PROVIDERS.OPENAI.MODELS.GPT_5_5.MAX_OUTPUT_TOKENS,
        },
      ],
      reasoningEffort: PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.MEDIUM,
      reasoningEfforts: [
        PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.LOW,
        PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.MEDIUM,
        PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.REASONING.HIGH,
      ],
      reasoningSummary: PROVIDERS.OPENAI.REASONING_SUMMARIES.CONCISE,
    });
  });

  it("reads OpenAI API key and endpoint from the config-declared env refs", () => {
    const configWithCustomProviderEnv = defineSideChatConfig({
      ...sideChatConfig,
      models: {
        ...sideChatConfig.models,
        provider: {
          kind: PROVIDERS.OPENAI.KIND,
          connection: {
            apiKey: readEnv.secret("CUSTOM_OPENAI_API_KEY"),
            endpoint: readEnv.optional("CUSTOM_OPENAI_ENDPOINT"),
          },
        },
      },
    });

    const options = createPartnerAiServiceOptionsFromConfig(configWithCustomProviderEnv, {
      CUSTOM_OPENAI_API_KEY: "custom_key",
      CUSTOM_OPENAI_ENDPOINT: "https://gateway.example/openai/v1",
      [SERVICE_ENV_KEYS.databaseUrl]: "postgres://sidechat:sidechat@localhost/sidechat",
      [SERVICE_ENV_KEYS.authBearerToken]: "prod-token",
    });

    expect(options.runtime).toMatchObject({
      provider: PROVIDERS.OPENAI.KIND,
      apiKey: "custom_key",
      baseUrl: "https://gateway.example/openai/v1",
    });
  });

  it("rejects OpenAI config without the secret env value", () => {
    expect(() =>
      createPartnerAiServiceOptionsFromConfig(sideChatConfig, {
        [SERVICE_ENV_KEYS.databaseUrl]: "postgres://sidechat:sidechat@localhost/sidechat",
        [SERVICE_ENV_KEYS.authBearerToken]: "prod-token",
      }),
    ).toThrow("SIDECHAT_OPENAI_API_KEY is required");
  });

  it("rejects request-policy model ids outside the configured model list", () => {
    const brokenConfig = defineSideChatConfig({
      ...sideChatConfig,
      requestPolicy: {
        mode: REQUEST_POLICY_MODES.CONFIGURED,
        modelEntitlements: {
          modelIds: [PROVIDERS.FAKE.MODELS.FAKE_ECHO.MODEL_ID],
        },
      },
    });

    expect(() => createPartnerAiServiceOptionsFromConfig(brokenConfig, {})).toThrow(
      "Request policy references model",
    );
  });
});

const createTestFakeConfig = () =>
  defineSideChatConfig({
    ...sideChatConfig,
    environment: {
      ...sideChatConfig.environment,
      profile: readEnv(SERVICE_ENV_KEYS.profile, { defaultValue: SERVICE_PROFILES.DEVELOPMENT }),
      authBearerToken: readEnv.secret(SERVICE_ENV_KEYS.authBearerToken, { required: false }),
      databaseUrl: readEnv.secret(SERVICE_ENV_KEYS.databaseUrl, { required: false }),
    },
    models: {
      provider: { kind: PROVIDERS.FAKE.KIND },
      default: {
        model: PROVIDERS.FAKE.MODELS.FAKE_ECHO,
        reasoning: PROVIDERS.FAKE.MODELS.FAKE_ECHO.REASONING.MEDIUM,
      },
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
    requestPolicy: {
      mode: REQUEST_POLICY_MODES.ALLOW_ALL,
      modelEntitlements: {
        modelIds: [PROVIDERS.FAKE.MODELS.FAKE_ECHO.MODEL_ID],
      },
    },
    context: {
      ...sideChatConfig.context,
      history: {
        mode: HISTORY_CONTEXT_MODES.DISABLED,
        maxMessages: 12,
        maxTokens: 4_000,
      },
    },
  });
