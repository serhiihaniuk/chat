import { TURN_REJECTION_CODES, TurnRejectedError } from "./turn-errors.js";

export type TurnModelPolicy = (requestedModelId: string | undefined) => string;

/** Production exposes only its configured model; test composition may supply a broader policy. */
export function configuredTurnModel(configuredModelId: string): TurnModelPolicy {
  return (requestedModelId) => {
    if (requestedModelId === undefined || requestedModelId === configuredModelId) {
      return configuredModelId;
    }
    throw new TurnRejectedError(TURN_REJECTION_CODES.MODEL_NOT_ALLOWED, "Model is not available");
  };
}
