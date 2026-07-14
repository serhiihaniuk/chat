import type { SideChatReasoningEffort, SideChatReasoningSupport } from "@side-chat/stream-profile";

import { TURN_REJECTION_CODES, TurnRejectedError } from "./turn-errors.js";

export type ConfiguredTurnModel = Readonly<{
  id: string;
  reasoning?: SideChatReasoningSupport | undefined;
}>;

export type SelectedTurnModel = Readonly<{
  modelId: string;
  reasoningEffort?: SideChatReasoningEffort | undefined;
}>;

export type TurnModelPolicy = (
  requestedModelId: string | undefined,
  requestedReasoningEffort: SideChatReasoningEffort | undefined,
) => SelectedTurnModel;

/** Resolve a request only against the selected model's advertised reasoning policy. */
export function configuredTurnModel(configuredModel: ConfiguredTurnModel): TurnModelPolicy {
  return (requestedModelId, requestedReasoningEffort) => {
    if (requestedModelId !== undefined && requestedModelId !== configuredModel.id) {
      throw modelNotAllowed("Model is not available");
    }
    const reasoningEffort = selectReasoningEffort(
      configuredModel.reasoning,
      requestedReasoningEffort,
    );
    return {
      modelId: configuredModel.id,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    };
  };
}

function selectReasoningEffort(
  support: SideChatReasoningSupport | undefined,
  requested: SideChatReasoningEffort | undefined,
): SideChatReasoningEffort | undefined {
  if (support === undefined) {
    if (requested !== undefined) {
      throw modelNotAllowed("Reasoning effort is not configurable for this model");
    }
    return undefined;
  }
  const selected = requested ?? support.defaultEffort;
  if (support.efforts.includes(selected)) return selected;
  throw modelNotAllowed(`Reasoning effort ${selected} is not available for this model`);
}

function modelNotAllowed(message: string): TurnRejectedError {
  return new TurnRejectedError(TURN_REJECTION_CODES.MODEL_NOT_ALLOWED, message);
}
