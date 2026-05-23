import { describe, expect, it } from "vitest";

import { resolveQuickActionSelection } from "./quick-action-resolver.js";

describe("resolveQuickActionSelection", () => {
  it("returns trimmed prompt for selectable actions", () => {
    expect(
      resolveQuickActionSelection({
        id: "summary",
        label: "Summary",
        prompt: "  summarize this  ",
      }),
    ).toEqual({ prompt: "summarize this", status: "selected" });
  });

  it("ignores disabled or empty actions", () => {
    expect(
      resolveQuickActionSelection({
        disabled: true,
        id: "disabled",
        label: "Disabled",
        prompt: "hello",
      }),
    ).toEqual({ reason: "disabled", status: "ignored" });
    expect(
      resolveQuickActionSelection({
        id: "empty",
        label: "Empty",
        prompt: "   ",
      }),
    ).toEqual({ reason: "empty_prompt", status: "ignored" });
  });
});
