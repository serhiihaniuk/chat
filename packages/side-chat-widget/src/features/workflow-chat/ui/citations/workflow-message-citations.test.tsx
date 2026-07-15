import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkflowTimelineMessage } from "../../model/native-message-projection.js";
import { WorkflowMessageTimeline } from "../workflow-message-timeline.js";

describe("WorkflowMessageTimeline citations", () => {
  it("uses answer footnotes for inline citations and the sibling sources fold", () => {
    const message: WorkflowTimelineMessage = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "Claim [^1] and detail [^2].\n\n[^1]: Curated A. https://a.test\n[^2]: Curated B. https://b.test",
        },
        {
          type: "source-url",
          sourceId: "tool-source",
          url: "https://tool.test",
          title: "Tool fallback",
        },
      ],
    };

    const html = renderToStaticMarkup(<WorkflowMessageTimeline message={message} />);

    expect(html).toContain('data-slot="citation-ref"');
    expect(html).toContain('data-slot="sources-fold"');
    expect(html).toContain("2 sources");
  });
});
