import { SIDECHAT_EVENT_TYPES, SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";
import sideChatConfig from "#sidechat-config";
import sideChatFakeConfig from "#sidechat-fake-config";
import { createPartnerAiServiceApp } from "#inbound/http/app";
import { runTurnStream } from "#testing/turn-stream/turn-stream-harness.test-support";
import { EXECUTORS } from "#config/catalog/capabilities/executors";
import { TOOLS } from "#config/catalog/capabilities/tools";
import {
  HISTORY_CONTEXT_MODES,
  REQUEST_POLICY_MODES,
  RESUMABILITY_DEFAULTS,
  SERVICE_PROFILES,
} from "#config/catalog/config-values";
import { PROVIDERS } from "#config/catalog/providers";
import {
  createPartnerAiServiceOptionsFromConfig,
  defineSideChatConfig,
  readEnv,
  type SideChatConfiguredModel,
} from "#config/sidechat-config";
import { SERVICE_ENV_KEYS } from "#config/env/service-env-contract";

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
    expect(events.at(-1)).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.COMPLETED,
    });
  });

  it("boots the shipped no-secrets fake config without any provider env", async () => {
    const options = createPartnerAiServiceOptionsFromConfig(sideChatFakeConfig, {
      [SERVICE_ENV_KEYS.authBearerToken]: "local-fake-token",
      [SERVICE_ENV_KEYS.safetyPollIntervalMs]: "10",
    });
    expect(options.runtime).toMatchObject({
      provider: PROVIDERS.FAKE.KIND,
      modelId: PROVIDERS.FAKE.MODELS.FAKE_ECHO.MODEL_ID,
    });

    const app = createPartnerAiServiceApp(options);
    const { events } = await runTurnStream(app, validRequest, "Bearer local-fake-token");
    expect(events.at(-1)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.COMPLETED });
  });

  it("resolves resumability batch knobs from the readable config", () => {
    const baseEnv = {
      [PROVIDERS.OPENAI.SECRET_ENV_KEYS.API_KEY]: "key_123",
      [SERVICE_ENV_KEYS.databaseUrl]: "postgres://sidechat:sidechat@localhost/sidechat",
      [SERVICE_ENV_KEYS.authBearerToken]: "prod-token",
    } as const;

    // Defaults come from RESUMABILITY_DEFAULTS via the config's readEnv declarations.
    const defaults = createPartnerAiServiceOptionsFromConfig(sideChatConfig, baseEnv);
    expect(defaults.resumability).toMatchObject({
      reaperBatchLimit: RESUMABILITY_DEFAULTS.REAPER_BATCH_LIMIT,
    });

    // Env overrides flow through the same readable-config resolver.
    const overridden = createPartnerAiServiceOptionsFromConfig(sideChatConfig, {
      ...baseEnv,
      [SERVICE_ENV_KEYS.reaperBatchLimit]: "25",
    });
    expect(overridden.resumability).toMatchObject({
      reaperBatchLimit: 25,
    });
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

  it("builds an Azure service from the readable config with per-model deployments", async () => {
    const options = createPartnerAiServiceOptionsFromConfig(createAzureConfig(), {
      [PROVIDERS.AZURE.SECRET_ENV_KEYS.API_KEY]: "azure_key_123",
      [PROVIDERS.AZURE.TRANSPORT_ENV_KEYS.ENDPOINT]: "https://res.cognitiveservices.azure.com",
      [SERVICE_ENV_KEYS.databaseUrl]: "postgres://sidechat:sidechat@localhost/sidechat",
      [SERVICE_ENV_KEYS.authBearerToken]: "prod-token",
    });

    expect(options.runtime).toMatchObject({
      provider: PROVIDERS.AZURE.KIND,
      apiKey: "azure_key_123",
      endpoint: "https://res.cognitiveservices.azure.com",
      apiVersion: "2024-12-01-preview",
      modelIds: [PROVIDERS.AZURE.MODELS.GPT_4O.MODEL_ID],
      defaultModelId: PROVIDERS.AZURE.MODELS.GPT_4O.MODEL_ID,
      deploymentsByModelId: { [PROVIDERS.AZURE.MODELS.GPT_4O.MODEL_ID]: "my-gpt4o-prod" },
    });
    // The turn profile carries the Azure provider id, not OpenAI.
    expect(options.turnProfiles?.[0]?.model).toMatchObject({
      providerId: PROVIDERS.AZURE.PROVIDER_ID,
      modelId: PROVIDERS.AZURE.MODELS.GPT_4O.MODEL_ID,
    });

    // Composition builds the Azure provider and /models publishes it.
    const app = createPartnerAiServiceApp(options);
    const models = await app.request("/models", {
      headers: { authorization: "Bearer prod-token" },
    });
    await expect(models.json()).resolves.toMatchObject({
      defaultModel: {
        providerId: PROVIDERS.AZURE.PROVIDER_ID,
        modelId: PROVIDERS.AZURE.MODELS.GPT_4O.MODEL_ID,
      },
      models: [
        {
          providerId: PROVIDERS.AZURE.PROVIDER_ID,
          modelId: PROVIDERS.AZURE.MODELS.GPT_4O.MODEL_ID,
          displayName: PROVIDERS.AZURE.MODELS.GPT_4O.DISPLAY_NAME,
        },
      ],
    });
  });

  it("overrides an Azure deployment name from env", () => {
    const options = createPartnerAiServiceOptionsFromConfig(createAzureConfig(), {
      [PROVIDERS.AZURE.SECRET_ENV_KEYS.API_KEY]: "azure_key_123",
      [PROVIDERS.AZURE.TRANSPORT_ENV_KEYS.ENDPOINT]: "https://res.cognitiveservices.azure.com",
      SIDECHAT_AZURE_DEPLOYMENT_GPT_4O: "gpt4o-canary",
      [SERVICE_ENV_KEYS.databaseUrl]: "postgres://sidechat:sidechat@localhost/sidechat",
      [SERVICE_ENV_KEYS.authBearerToken]: "prod-token",
    });

    expect(options.runtime).toMatchObject({
      deploymentsByModelId: { [PROVIDERS.AZURE.MODELS.GPT_4O.MODEL_ID]: "gpt4o-canary" },
    });
  });

  it("rejects an Azure model that has no deployment in the connection", () => {
    const missingDeployment = defineSideChatConfig({
      ...createAzureConfig(),
      models: {
        ...createAzureConfig().models,
        provider: {
          kind: PROVIDERS.AZURE.KIND,
          connection: {
            apiKey: readEnv.secret(PROVIDERS.AZURE.SECRET_ENV_KEYS.API_KEY),
            endpoint: readEnv(PROVIDERS.AZURE.TRANSPORT_ENV_KEYS.ENDPOINT, { required: true }),
            apiVersion: readEnv(PROVIDERS.AZURE.TRANSPORT_ENV_KEYS.API_VERSION, {
              defaultValue: "2024-12-01-preview",
            }),
            deployments: {},
          },
        },
      },
    });

    expect(() => createPartnerAiServiceOptionsFromConfig(missingDeployment, {})).toThrow(
      "is missing a deployment",
    );
  });
});

const createAzureConfig = () =>
  defineSideChatConfig({
    ...sideChatConfig,
    models: {
      provider: {
        kind: PROVIDERS.AZURE.KIND,
        connection: {
          apiKey: readEnv.secret(PROVIDERS.AZURE.SECRET_ENV_KEYS.API_KEY),
          endpoint: readEnv(PROVIDERS.AZURE.TRANSPORT_ENV_KEYS.ENDPOINT, { required: true }),
          apiVersion: readEnv(PROVIDERS.AZURE.TRANSPORT_ENV_KEYS.API_VERSION, {
            defaultValue: "2024-12-01-preview",
          }),
          deployments: {
            [PROVIDERS.AZURE.MODELS.GPT_4O.MODEL_ID]: readEnv("SIDECHAT_AZURE_DEPLOYMENT_GPT_4O", {
              defaultValue: "my-gpt4o-prod",
            }),
          },
        },
      },
      default: {
        model: PROVIDERS.AZURE.MODELS.GPT_4O,
        reasoning: PROVIDERS.AZURE.MODELS.GPT_4O.REASONING.NONE,
      },
      availableModels: [
        {
          model: PROVIDERS.AZURE.MODELS.GPT_4O,
          reasoning: {
            default: PROVIDERS.AZURE.MODELS.GPT_4O.REASONING.NONE,
            options: [PROVIDERS.AZURE.MODELS.GPT_4O.REASONING.NONE],
          },
        } satisfies SideChatConfiguredModel<typeof PROVIDERS.AZURE.MODELS.GPT_4O>,
      ],
    },
    requestPolicy: {
      mode: REQUEST_POLICY_MODES.CONFIGURED,
      modelEntitlements: {
        modelIds: [PROVIDERS.AZURE.MODELS.GPT_4O.MODEL_ID],
      },
    },
  });

const createTestFakeConfig = () =>
  defineSideChatConfig({
    ...sideChatConfig,
    environment: {
      ...sideChatConfig.environment,
      profile: readEnv(SERVICE_ENV_KEYS.profile, {
        defaultValue: SERVICE_PROFILES.DEVELOPMENT,
      }),
      authBearerToken: readEnv.secret(SERVICE_ENV_KEYS.authBearerToken, {
        required: false,
      }),
      databaseUrl: readEnv.secret(SERVICE_ENV_KEYS.databaseUrl, {
        required: false,
      }),
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
