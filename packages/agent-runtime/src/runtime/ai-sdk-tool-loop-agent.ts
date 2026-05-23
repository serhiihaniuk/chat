import type { LanguageModel } from "ai";

import type { RuntimeEvent } from "../events.js";
import type { RuntimeRequest } from "../provider.js";
import {
  createAiSdkRuntimeEngine,
  type AiSdkModelResolver,
} from "./ai-sdk-engine.js";

export type AiSdkToolLoopAgentOptions = {
  readonly resolveModel: AiSdkModelResolver;
};

export class ToolLoopAgent {
  readonly #resolveModel: AiSdkModelResolver;

  constructor(options: AiSdkToolLoopAgentOptions) {
    this.#resolveModel = options.resolveModel;
  }

  stream(request: RuntimeRequest): AsyncIterable<RuntimeEvent> {
    return createAiSdkRuntimeEngine().stream(request, this.#resolveModel);
  }
}

export const createAiSdkToolLoopAgent = (
  resolveModel: (request: RuntimeRequest) => LanguageModel,
): ToolLoopAgent => new ToolLoopAgent({ resolveModel });
