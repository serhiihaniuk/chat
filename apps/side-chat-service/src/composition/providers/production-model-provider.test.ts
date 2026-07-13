import { streamText } from "ai";
import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from "@workflow/serde";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DurableLanguageModel, ProviderOptions } from "#application/ports/model-provider";
import type { SideChatConfig } from "#config/declaration/side-chat-config";
import { AZURE_PROVIDER } from "#config/providers/azure-provider-config";
import { OPENAI_PROVIDER } from "#config/providers/openai-provider-config";
import { SCRIPTED_PROVIDER } from "#config/providers/scripted-provider-config";
import { validateSettings, type Settings } from "#config/settings/resolve-settings";
import { createDefaultConfig } from "#config/settings/settings.test-fixture";

import {
  createProductionModelProvider,
  ProductionModelHandle,
} from "./production-model-provider.js";

const CREDENTIAL_SENTINEL = "PRIVATE_PROVIDER_CREDENTIAL_SENTINEL";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("production Workflow model serialization", () => {
  it("rehydrates a callable OpenAI model without journaling its credential", async () => {
    vi.stubEnv(OPENAI_PROVIDER.SECRET_ENV_KEYS.API_KEY, CREDENTIAL_SENTINEL);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(openAiEvent({ type: "response.completed", response: { usage: {} } }), {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
        ),
      ),
    );
    const settings = settingsWith({
      provider: OPENAI_PROVIDER.KIND,
      modelId: "gpt-5.4",
      titleModelId: "gpt-5.4",
      contextWindowTokens: 16_000,
      apiKey: CREDENTIAL_SENTINEL,
      baseUrl: "https://openai.test/v1",
      reasoningEffort: OPENAI_PROVIDER.REASONING_EFFORTS.MEDIUM,
    });
    const resolved = createProductionModelProvider(settings).modelFor({
      modelId: "gpt-5.4",
      requestId: "request-openai",
    });
    const handle = requireProductionHandle(resolved.model);

    const descriptor = ProductionModelHandle[WORKFLOW_SERIALIZE](handle);
    expect(JSON.stringify(descriptor)).not.toContain(CREDENTIAL_SENTINEL);
    expect(descriptor).toEqual({
      provider: OPENAI_PROVIDER.KIND,
      modelId: "gpt-5.4",
      baseUrl: "https://openai.test/v1",
    });

    const rehydrated = ProductionModelHandle[WORKFLOW_DESERIALIZE](descriptor);
    await consumeModel(rehydrated, resolved.providerOptions);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rehydrates a callable Azure model from non-secret deployment routing", async () => {
    vi.stubEnv(AZURE_PROVIDER.SECRET_ENV_KEYS.API_KEY, CREDENTIAL_SENTINEL);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            [
              azureEvent({ delta: { role: "assistant", content: "ok" } }),
              azureEvent({ delta: {}, finish_reason: "stop" }),
              "data: [DONE]\n\n",
            ].join(""),
            { status: 200, headers: { "content-type": "text/event-stream" } },
          ),
        ),
      ),
    );
    const settings = settingsWith({
      provider: AZURE_PROVIDER.KIND,
      modelId: "gpt-4o",
      titleModelId: "gpt-4o",
      contextWindowTokens: 128_000,
      deployment: "side-chat-test",
      apiKey: CREDENTIAL_SENTINEL,
      endpoint: "https://azure.test",
      apiVersion: "2025-01-01-preview",
    });
    const resolved = createProductionModelProvider(settings).modelFor({
      modelId: "gpt-4o",
      requestId: "request-azure",
    });
    const handle = requireProductionHandle(resolved.model);

    const descriptor = ProductionModelHandle[WORKFLOW_SERIALIZE](handle);
    expect(JSON.stringify(descriptor)).not.toContain(CREDENTIAL_SENTINEL);
    expect(descriptor).toEqual({
      provider: AZURE_PROVIDER.KIND,
      modelId: "gpt-4o",
      endpoint: "https://azure.test",
      apiVersion: "2025-01-01-preview",
      deployment: "side-chat-test",
    });

    const rehydrated = ProductionModelHandle[WORKFLOW_DESERIALIZE](descriptor);
    await consumeModel(rehydrated);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("fails safely when the step realm has no provider credential", () => {
    vi.stubEnv(OPENAI_PROVIDER.SECRET_ENV_KEYS.API_KEY, "");
    expect(() =>
      ProductionModelHandle[WORKFLOW_DESERIALIZE]({
        provider: OPENAI_PROVIDER.KIND,
        modelId: "gpt-5.4",
      }),
    ).toThrow("OpenAI provider credential is not configured");
  });

  it("keeps scripted models outside production composition", () => {
    expect(() => createProductionModelProvider(settingsWith(scriptedModels()))).toThrow(
      "Unsupported production model provider",
    );
  });
});

function settingsWith(models: SideChatConfig["models"]): Settings {
  const result = validateSettings(createDefaultConfig({ models }));
  if (!result.ok) throw new Error("Test settings must be valid");
  return result.settings;
}

function scriptedModels(): SideChatConfig["models"] {
  return {
    provider: SCRIPTED_PROVIDER.KIND,
    modelId: SCRIPTED_PROVIDER.MODELS.COMPLETE.MODEL_ID,
    titleModelId: SCRIPTED_PROVIDER.MODELS.TITLE.MODEL_ID,
    contextWindowTokens: SCRIPTED_PROVIDER.MODELS.COMPLETE.CONTEXT_WINDOW_TOKENS,
  };
}

function requireProductionHandle(model: DurableLanguageModel): ProductionModelHandle {
  if (!(model instanceof ProductionModelHandle)) {
    throw new Error("Production composition returned an unexpected model handle");
  }
  return model;
}

async function consumeModel(
  model: DurableLanguageModel,
  providerOptions?: ProviderOptions,
): Promise<void> {
  const result = streamText({
    model,
    prompt: "hello",
    ...(providerOptions === undefined ? {} : { providerOptions }),
  });
  for await (const _part of result.fullStream) {
    // Consuming the stream proves the rehydrated delegate can build and send its request.
  }
}

function openAiEvent(event: object): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function azureEvent(choice: object): string {
  return `data: ${JSON.stringify({ id: "chatcmpl_test", choices: [{ index: 0, ...choice }] })}\n\n`;
}
