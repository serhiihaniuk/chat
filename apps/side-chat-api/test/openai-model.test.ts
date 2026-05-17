import { describe, expect, it } from "vitest";
import { isCurrentSurfaceQuestion } from "#adapters/ai/openai-model.js";

describe("openai model adapter", () => {
  it("treats page-listed wording as a current surface question", () => {
    expect(isCurrentSurfaceQuestion("what do i have on the page listed")).toBe(
      true,
    );
    expect(isCurrentSurfaceQuestion("which rows are on screen now?")).toBe(
      true,
    );
  });
});
