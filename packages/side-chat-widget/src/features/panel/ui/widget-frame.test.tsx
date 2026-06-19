import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ClosedWidgetLauncher, WidgetHeader } from "./widget-frame.js";

describe("widget-frame", () => {
  it("renders accessible settings, new-chat, and close controls in the header", () => {
    const html = renderToStaticMarkup(
      <WidgetHeader
        onClose={() => undefined}
        onNewConversation={() => undefined}
        onOpenSettings={() => undefined}
        title={<h2>Workspace Assistant</h2>}
      />,
    );

    expect(html).toContain("Workspace Assistant");
    expect(html).toContain('aria-label="Settings"');
    expect(html).toContain('aria-label="Start new chat"');
    expect(html).toContain('aria-label="Close"');
  });

  it("renders the closed launcher action", () => {
    const html = renderToStaticMarkup(
      <ClosedWidgetLauncher label="Open assistant" onOpen={() => undefined} />,
    );

    expect(html).toContain("Open assistant");
    expect(html).toContain('type="button"');
  });
});
