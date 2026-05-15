import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Reasoning } from "../components/ai-elements/reasoning.js";

describe("Reasoning rendering", () => {
  it("renders reasoning through the chain-of-thought shell while streaming", () => {
    const html = renderToStaticMarkup(
      createElement(Reasoning, { isStreaming: true }, "Checking the source row."),
    );

    expect(html).toContain("Thinking...");
    expect(html).toContain("Checking the source row.");
  });
});
