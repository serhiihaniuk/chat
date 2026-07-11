import { describe, expect, it } from "vitest";

import { sumTurnUsage } from "./turn.js";

describe("sumTurnUsage", () => {
  it("sums every model step", () => {
    expect(
      sumTurnUsage([
        { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
        { inputTokens: 7, outputTokens: 11, totalTokens: 18 },
      ]),
    ).toEqual({
      inputTokens: 9,
      outputTokens: 14,
      totalTokens: 23,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    });
  });
});
