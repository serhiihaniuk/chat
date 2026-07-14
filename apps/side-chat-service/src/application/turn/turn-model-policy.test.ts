import { SIDE_CHAT_REASONING_EFFORTS } from "@side-chat/stream-profile";
import { describe, expect, it } from "vitest";

import { TURN_REJECTION_CODES, TurnRejectedError } from "./turn-errors.js";
import { configuredTurnModel } from "./turn-model-policy.js";

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

describe("configuredTurnModel", () => {
  it("uses the selected model's default and accepts only its advertised efforts", () => {
    const select = configuredTurnModel(luna);

    expect(select(undefined, undefined)).toEqual({
      modelId: luna.id,
      reasoningEffort: SIDE_CHAT_REASONING_EFFORTS.MEDIUM,
    });
    expect(select(luna.id, SIDE_CHAT_REASONING_EFFORTS.LOW)).toEqual({
      modelId: luna.id,
      reasoningEffort: SIDE_CHAT_REASONING_EFFORTS.LOW,
    });
    expect(() => select(luna.id, SIDE_CHAT_REASONING_EFFORTS.XHIGH)).toThrowError(
      expect.objectContaining({ code: TURN_REJECTION_CODES.MODEL_NOT_ALLOWED }),
    );
  });

  it("rejects reasoning for a model that does not advertise it", () => {
    const select = configuredTurnModel({ id: "plain-model" });

    expect(select(undefined, undefined)).toEqual({ modelId: "plain-model" });
    expect(() => select(undefined, SIDE_CHAT_REASONING_EFFORTS.LOW)).toThrow(TurnRejectedError);
  });
});
