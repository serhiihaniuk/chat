import { FileTextIcon } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WidgetEmptyState } from "./widget-empty-state.js";

describe("WidgetEmptyState", () => {
  it("renders the greeting and one button per suggestion", () => {
    const html = renderToStaticMarkup(
      <WidgetEmptyState
        description="I can see the page you're viewing."
        onSelectSuggestion={() => undefined}
        suggestions={[
          { icon: FileTextIcon, id: "summarize", label: "Summarize this page", prompt: "Summarize." },
        ]}
        title="How can I help with this page?"
      />,
    );

    expect(html).toContain("How can I help with this page?");
    expect(html).toContain("Summarize this page");
  });

  it("omits the suggestion list when there are no quick actions", () => {
    const html = renderToStaticMarkup(
      <WidgetEmptyState
        description="No actions."
        onSelectSuggestion={() => undefined}
        suggestions={[]}
        title="How can I help?"
      />,
    );

    expect(html).not.toContain("<ul");
  });
});
