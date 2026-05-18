import { describe, expect, it } from "vitest";

import { sourceBackedBriefPrompt } from "../ui/composer/QuickActions.js";

describe("QuickActions", () => {
  it("includes a source-backed demo prompt that asks for multiple data sources", () => {
    expect(sourceBackedBriefPrompt).toContain("dashboard KPIs");
    expect(sourceBackedBriefPrompt).toContain("current Portfolio Worklist view");
    expect(sourceBackedBriefPrompt).toContain("top risk accounts");
    expect(sourceBackedBriefPrompt).toContain("product allocation");
    expect(sourceBackedBriefPrompt).toContain("Net New Money trend");
  });
});
