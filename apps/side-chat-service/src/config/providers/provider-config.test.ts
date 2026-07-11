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
    expect(OPENAI_PROVIDER.MODELS.GPT_5_4.MODEL_ID).toBe("gpt-5.4");
    expect(OPENAI_PROVIDER.SECRET_ENV_KEYS.API_KEY).toBe("OPENAI_API_KEY");
    expect(AZURE_PROVIDER.MODELS.GPT_4O.MODEL_ID).toBe("gpt-4o");
    expect(AZURE_PROVIDER.TRANSPORT_ENV_KEYS.DEPLOYMENT).toBe("AZURE_OPENAI_DEPLOYMENT");
  });

  it("decodes provider settings beside the provider catalog", () => {
    const openAiIssues: SettingsIssue[] = [];
    const openAi = readOpenAIModelSettings(
      {
        modelId: OPENAI_PROVIDER.MODELS.GPT_5_4.MODEL_ID,
        titleModelId: OPENAI_PROVIDER.MODELS.GPT_5_4.MODEL_ID,
        apiKey: "test-key",
        reasoningEffort: OPENAI_PROVIDER.REASONING_EFFORTS.MEDIUM,
      },
      openAiIssues,
    );
    const azureIssues: SettingsIssue[] = [];
    const azure = readAzureModelSettings(
      {
        modelId: AZURE_PROVIDER.MODELS.GPT_4O.MODEL_ID,
        titleModelId: AZURE_PROVIDER.MODELS.GPT_4O.MODEL_ID,
        deployment: "test-deployment",
        apiKey: "test-key",
        endpoint: "https://azure.test",
        apiVersion: "test-version",
      },
      azureIssues,
    );

    expect(openAi).toMatchObject({
      provider: OPENAI_PROVIDER.KIND,
      reasoningEffort: OPENAI_PROVIDER.REASONING_EFFORTS.MEDIUM,
    });
    expect(azure.provider).toBe(AZURE_PROVIDER.KIND);
    expect(openAiIssues).toEqual([]);
    expect(azureIssues).toEqual([]);
  });
});
