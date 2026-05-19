import { describe, expect, it } from "vitest";
import {
  applyModelAliasReasoning,
  defaultModelAliasId,
} from "../domain/model/model-selection.js";

describe("model selection", () => {
  const model = {
    provider: "openai",
    id: "gpt-5.4-nano",
    reasoningEffort: "high",
  } as const;

  it("uses medium reasoning for the default model alias", () => {
    expect(applyModelAliasReasoning(model, defaultModelAliasId)).toEqual({
      ...model,
      reasoningEffort: "medium",
    });
  });

  it("uses high reasoning after choosing a non-default model alias", () => {
    expect(applyModelAliasReasoning(model, "gpt-6.0")).toEqual({
      ...model,
      reasoningEffort: "high",
    });
  });
});
