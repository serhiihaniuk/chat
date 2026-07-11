import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from "@workflow/serde";

import type { ModelProvider } from "#application/ports/model-provider";

import { isProviderScriptMode, type ProviderScriptMode } from "./scripted-provider-contract.js";
import { recordProviderAttempt } from "./scripted-provider-observations.js";
import { createScriptedStream } from "./provider/scripted-provider-stream.js";

export {
  LATE_CONTENT_MARKER,
  PROVIDER_SCRIPT_MODE,
  type ProviderScriptMode,
} from "./scripted-provider-contract.js";
export { PROVIDER_OBSERVATION_PREFIX } from "./scripted-provider-observations.js";

interface SerializedScriptedModel {
  readonly requestId: string;
  readonly mode: ProviderScriptMode;
}

export function createScriptedLanguageModel(
  requestId: string,
  mode: ProviderScriptMode,
): LanguageModelV4 {
  return new ScriptedLanguageModel(requestId, mode);
}

/** Testing composition exposes the deterministic model through the application port. */
export const scriptedModelProvider: ModelProvider = {
  modelFor: ({ modelId, requestId }) => {
    if (isProviderScriptMode(modelId)) {
      return { model: createScriptedLanguageModel(requestId, modelId) };
    }
    throw new Error(`Unknown scripted model behavior: ${modelId}`);
  },
};

/**
 * Credential-free compatibility provider. Workflow serialization preserves
 * only request identity and scripted behavior; execution state stays in the
 * host-side provider process.
 */
class ScriptedLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = "v4";
  readonly provider = "side-chat-scripted";
  readonly modelId = "workflow-compatibility";
  readonly supportedUrls = {};

  constructor(
    readonly requestId: string,
    readonly mode: ProviderScriptMode,
  ) {}

  static [WORKFLOW_SERIALIZE](instance: ScriptedLanguageModel): SerializedScriptedModel {
    return { requestId: instance.requestId, mode: instance.mode };
  }

  static [WORKFLOW_DESERIALIZE](data: SerializedScriptedModel): ScriptedLanguageModel {
    return new ScriptedLanguageModel(data.requestId, data.mode);
  }

  doGenerate(_options: LanguageModelV4CallOptions): PromiseLike<LanguageModelV4GenerateResult> {
    throw new Error("The compatibility model supports streaming only");
  }

  doStream(options: LanguageModelV4CallOptions): PromiseLike<LanguageModelV4StreamResult> {
    const attemptCount = recordProviderAttempt(
      this.requestId,
      this.mode,
      options.abortSignal?.aborted ?? false,
    );
    return Promise.resolve({
      stream: createScriptedStream(this.requestId, this.mode, attemptCount, options.abortSignal),
    });
  }
}
