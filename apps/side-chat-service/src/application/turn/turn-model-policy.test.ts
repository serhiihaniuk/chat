import { SIDE_CHAT_REASONING_EFFORTS } from "@side-chat/stream-profile";
import { describe, expect, it } from "vitest";

import { TURN_REJECTION_CODES, TurnRejectedError } from "./turn-errors.js";
import { configuredTurnModelCatalog } from "./turn-model-policy.js";

const luna = {
  id: "gpt-5.6-luna",
  reasoning: {
    efforts: [
      SIDE_CHAT_REASONING_EFFORTS.LOW,
      SIDE_CHAT_REASONING_EFFORTS.MEDIUM,
      SIDE_CHAT_REASONING_EFFORTS.HIGH,
    ],
    defaultEffort: SIDE_CHAT_REASONING_EFFORTS.MEDIUM,
  },
} as const;

describe("configuredTurnModelCatalog", () => {
  it("uses the configured default and selects any advertised model", () => {
    const select = configuredTurnModelCatalog({
      defaultModelId: luna.id,
      availableModels: [luna, { id: "plain-model" }],
    });

    expect(select(undefined, undefined)).toEqual({
      modelId: luna.id,
      reasoningEffort: SIDE_CHAT_REASONING_EFFORTS.MEDIUM,
    });
    expect(select(luna.id, SIDE_CHAT_REASONING_EFFORTS.LOW)).toEqual({
      modelId: luna.id,
      reasoningEffort: SIDE_CHAT_REASONING_EFFORTS.LOW,
    });
    expect(select("plain-model", undefined)).toEqual({ modelId: "plain-model" });
    expect(() => select(luna.id, SIDE_CHAT_REASONING_EFFORTS.XHIGH)).toThrowError(
      expect.objectContaining({ code: TURN_REJECTION_CODES.MODEL_NOT_ALLOWED }),
    );
  });

  it("rejects unavailable models and reasoning outside the selected model policy", () => {
    const select = configuredTurnModelCatalog({
      defaultModelId: "plain-model",
      availableModels: [{ id: "plain-model" }],
    });

    expect(select(undefined, undefined)).toEqual({ modelId: "plain-model" });
    expect(() => select(undefined, SIDE_CHAT_REASONING_EFFORTS.LOW)).toThrow(TurnRejectedError);
    expect(() => select("unknown-model", undefined)).toThrowError(
      expect.objectContaining({ code: TURN_REJECTION_CODES.MODEL_NOT_ALLOWED }),
    );
  });
});
