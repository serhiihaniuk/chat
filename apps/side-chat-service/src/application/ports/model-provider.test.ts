import { describe, expect, it } from "vitest";

import { createScriptedLanguageModel } from "#testing/scripted-language-model";

import { assertModelInstance } from "./model-provider.js";

describe("assertModelInstance", () => {
  it("rejects string model ids and accepts constructed models", () => {
    expect(() => assertModelInstance("openai/gpt-5.4")).toThrow("constructed model instance");
    expect(() =>
      assertModelInstance(createScriptedLanguageModel("request", "complete")),
    ).not.toThrow();
  });
});
