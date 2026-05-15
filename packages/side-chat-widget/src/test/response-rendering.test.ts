import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MessageResponse } from "../components/ai-elements/message.js";

describe("Response markdown rendering", () => {
  it("renders partial markdown without throwing", () => {
    const html = renderToStaticMarkup(
      createElement(MessageResponse, null, "# Partial\n- item\n```ts\nconst value = 1"),
    );

    expect(html).toContain("Partial");
    expect(html).toContain("item");
    expect(html).toContain("const value = 1");
  });

  it("does not emit executable script tags from malicious markdown", () => {
    const html = renderToStaticMarkup(
      createElement(
        MessageResponse,
        null,
        'safe text <script>alert("xss")</script>',
      ),
    );

    expect(html).toContain("safe text");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(&quot;xss&quot;)");
  });
});
