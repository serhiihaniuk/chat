import { describe, expect, it } from "vitest";

import type { SettingsIssue } from "../settings/setting-readers.js";

import { AZURE_PROVIDER, readAzureModelSettings } from "./azure-provider-config.js";
import {
  OPENAI_PROVIDER,
  openAIReasoningSupport,
  readOpenAIModelSettings,
} from "./openai-provider-config.js";
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

  it("keeps supported reasoning and its default on the Luna model descriptor", () => {
    const luna = OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA;

    expect(openAIReasoningSupport(luna.MODEL_ID)).toEqual({
      efforts: luna.SUPPORTED_REASONING_EFFORTS,
      defaultEffort: luna.DEFAULT_REASONING_EFFORT,
    });
    expect(openAIReasoningSupport("unregistered-model")).toBeUndefined();
  });

  it("decodes provider settings beside the provider catalog", () => {
    const openAiIssues: SettingsIssue[] = [];
    const openAi = readOpenAIModelSettings(
      {
        modelId: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.MODEL_ID,
        titleModelId: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.MODEL_ID,
        contextWindowTokens: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.CONTEXT_WINDOW_TOKENS,
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
        contextWindowTokens: AZURE_PROVIDER.MODELS.GPT_4O.CONTEXT_WINDOW_TOKENS,
        deployment: "test-deployment",
        apiKey: "test-key",
        endpoint: "https://azure.test",
        apiVersion: "test-version",
      },
      azureIssues,
    );

    expect(openAi).toMatchObject({
      provider: OPENAI_PROVIDER.KIND,
      contextWindowTokens: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.CONTEXT_WINDOW_TOKENS,
      reasoningEffort: OPENAI_PROVIDER.REASONING_EFFORTS.MEDIUM,
    });
    expect(azure).toMatchObject({
      provider: AZURE_PROVIDER.KIND,
      contextWindowTokens: AZURE_PROVIDER.MODELS.GPT_4O.CONTEXT_WINDOW_TOKENS,
    });
    expect(openAiIssues).toEqual([]);
    expect(azureIssues).toEqual([]);
  });
});
