import { describe, expect, it } from "vitest";

import { createScriptedLanguageModel } from "#testing/scripted-language-model";

import { assertDurableModelHandle } from "./model-provider.js";

describe("assertDurableModelHandle", () => {
  it("rejects ids and accepts the serde scripted handle", () => {
    expect(() => assertDurableModelHandle("openai/gpt-5.4")).toThrow(
      "Workflow-serializable model handle",
    );
    expect(() =>
      assertDurableModelHandle(createScriptedLanguageModel("request", "complete")),
    ).not.toThrow();
  });

  it("rejects an opaque SDK-shaped model without the durable marker", () => {
    const opaqueModel = {};
    expect(() => assertDurableModelHandle(opaqueModel)).toThrow(
      "Workflow-serializable model handle",
    );
  });
});
