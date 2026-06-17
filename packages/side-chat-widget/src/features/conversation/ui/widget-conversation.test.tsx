import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WidgetError } from "./widget-conversation.js";

describe("WidgetError", () => {
  it("renders the failure with retry and dismiss controls", () => {
    const html = renderToStaticMarkup(
      <WidgetError
        message="Chat client request failed: 502"
        onDismiss={() => undefined}
        onRetry={() => undefined}
      />,
    );

    expect(html).toContain("Chat client request failed: 502");
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-label="Dismiss error"');
    expect(html).toContain("Try again");
  });
});
