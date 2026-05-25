import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WidgetError } from "./widget-conversation.js";

describe("WidgetError", () => {
  it("renders a dismiss control for request failures", () => {
    const html = renderToStaticMarkup(
      <WidgetError message="Chat client request failed: 502" onDismiss={() => undefined} />,
    );

    expect(html).toContain("Chat client request failed: 502");
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-label="Dismiss error"');
  });

  it("renders nothing without an error message", () => {
    const html = renderToStaticMarkup(
      <WidgetError message={undefined} onDismiss={() => undefined} />,
    );

    expect(html).toBe("");
  });
});
