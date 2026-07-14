import { describe, expect, it } from "vitest";

import type { SettingsIssue } from "../settings/setting-readers.js";

import { AZURE_PROVIDER, readAzureModelSettings } from "./azure-provider-config.js";
import { OPENAI_PROVIDER, readOpenAIModelSettings } from "./openai-provider-config.js";
import { PROVIDER_KIND_VALUES } from "./provider-config.js";
import { SCRIPTED_PROVIDER } from "./scripted-provider-config.js";

describe("provider configuration catalogs", () => {
  it("keeps every provider kind unique and discoverable", () => {
    expect(PROVIDER_KIND_VALUES).toEqual([
      OPENAI_PROVIDER.KIND,
      AZURE_PROVIDER.KIND,
      SCRIPTED_PROVIDER.KIND,
    ]);
    expect(new Set(PROVIDER_KIND_VALUES).size).toBe(PROVIDER_KIND_VALUES.length);
  });

  it("owns model and deployment input names beside each provider", () => {
    expect(OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.MODEL_ID).toBe("gpt-5.6-luna");
    expect(OPENAI_PROVIDER.SECRET_ENV_KEYS.API_KEY).toBe("OPENAI_API_KEY");
    expect(AZURE_PROVIDER.MODELS.GPT_4O.MODEL_ID).toBe("gpt-4o");
    expect(AZURE_PROVIDER.TRANSPORT_ENV_KEYS.DEPLOYMENT).toBe("AZURE_OPENAI_DEPLOYMENT");
  });

  it("keeps provider constants available for readable deployment declarations", () => {
    const luna = OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA;

    expect(luna.SUPPORTED_REASONING_EFFORTS).toEqual(["low", "medium", "high"]);
    expect(luna.DEFAULT_REASONING_EFFORT).toBe("medium");
  });

  it("decodes provider settings beside the provider catalog", () => {
    const openAiIssues: SettingsIssue[] = [];
    const openAi = readOpenAIModelSettings(
      {
        connection: { apiKey: "test-key" },
        defaultModelId: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.MODEL_ID,
        availableModels: [
          {
            id: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.MODEL_ID,
            contextWindowTokens: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.CONTEXT_WINDOW_TOKENS,
            reasoning: {
              defaultEffort: OPENAI_PROVIDER.REASONING_EFFORTS.MEDIUM,
              efforts: [OPENAI_PROVIDER.REASONING_EFFORTS.MEDIUM],
            },
          },
        ],
      },
      openAiIssues,
    );
    const azureIssues: SettingsIssue[] = [];
    const azure = readAzureModelSettings(
      {
        connection: {
          apiKey: "test-key",
          endpoint: "https://azure.test",
          apiVersion: "test-version",
        },
        defaultModelId: AZURE_PROVIDER.MODELS.GPT_4O.MODEL_ID,
        availableModels: [
          {
            id: AZURE_PROVIDER.MODELS.GPT_4O.MODEL_ID,
            contextWindowTokens: AZURE_PROVIDER.MODELS.GPT_4O.CONTEXT_WINDOW_TOKENS,
            deployment: "test-deployment",
          },
        ],
      },
      azureIssues,
    );

    expect(openAi).toMatchObject({
      provider: OPENAI_PROVIDER.KIND,
      defaultModelId: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.MODEL_ID,
      availableModels: [
        expect.objectContaining({
          contextWindowTokens: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.CONTEXT_WINDOW_TOKENS,
        }),
      ],
    });
    expect(azure).toMatchObject({
      provider: AZURE_PROVIDER.KIND,
      availableModels: [
        expect.objectContaining({
          deployment: "test-deployment",
          contextWindowTokens: AZURE_PROVIDER.MODELS.GPT_4O.CONTEXT_WINDOW_TOKENS,
        }),
      ],
    });
    expect(openAiIssues).toEqual([]);
    expect(azureIssues).toEqual([]);
  });
});
