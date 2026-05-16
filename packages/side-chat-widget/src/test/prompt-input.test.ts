import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PromptInputModelSelect } from "../shared/ui/ai-elements/prompt-input.js";

describe("PromptInputModelSelect", () => {
  it("renders friendly model aliases instead of raw backend ids", () => {
    const html = renderToStaticMarkup(
      createElement(PromptInputModelSelect, {
        defaultOpen: true,
        modelId: "gpt-5.5",
        options: [
          { id: "gpt-5.5", label: "GPT 5.5" },
          { id: "claude-mythos", label: "Claude Mythos" },
          { id: "claude-mythos-2", label: "Claude Mythos 2" },
          { id: "gpt-6.0", label: "GPT 6.0" },
        ],
      }),
    );

    expect(html).toContain("GPT 5.5");
    expect(html).toContain("Claude Mythos");
    expect(html).toContain("Claude Mythos 2");
    expect(html).toContain("GPT 6.0");
    expect(html).not.toContain("Gemini Oracle");
    expect(html).not.toContain("gpt-5.4-nano");
  });
});
