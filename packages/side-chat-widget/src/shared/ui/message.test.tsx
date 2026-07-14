import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Message } from "./message.js";

describe("Message Markdown ownership", () => {
  it("renders exactly one sc-markdown hook for an assistant message", () => {
    const html = renderToStaticMarkup(
      <Message role="assistant" text="A paragraph with `inline code`." />,
    );

    expect(html.match(/\bsc-markdown\b/gu)).toHaveLength(1);
  });
});
