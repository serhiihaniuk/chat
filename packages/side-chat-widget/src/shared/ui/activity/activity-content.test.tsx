import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActivityImages } from "./activity-images.js";
import { SourcesFold } from "./citations.js";
import { ToolDetailRow } from "./tool-detail.js";

describe("SourcesFold", () => {
  it("renders linked source rows with domain meta and an external affordance", () => {
    const html = renderToStaticMarkup(
      <SourcesFold
        defaultOpen
        sources={[
          { label: "Mock Search Result", url: "https://example.test/search-result" },
          { label: "Pasted context excerpt" },
        ]}
      />,
    );

    expect(html).toContain("2 sources");
    expect(html).toContain("Mock Search Result");
    expect(html).toContain("example.test");
    // Linked source is a real anchor opening externally.
    expect(html).toContain('href="https://example.test/search-result"');
    expect(html).toContain('target="_blank"');
    // Terminal source (no url) lists without a link.
    expect(html).toContain("Pasted context excerpt");
    expect((html.match(/<a\s/gu) ?? []).length).toBe(1);
  });

  it("keeps the source list folded by default", () => {
    const html = renderToStaticMarkup(
      <SourcesFold sources={[{ label: "Mock Search Result", url: "https://example.test/a" }]} />,
    );

    expect(html).toContain("1 source");
    expect(html).not.toContain("Mock Search Result");
  });
});

describe("ActivityImages", () => {
  it("renders a constrained thumbnail from the base64 payload with its caption", () => {
    const html = renderToStaticMarkup(
      <ActivityImages
        images={[
          { alt: "Chart preview", caption: "Q4 chart", mediaType: "image/svg+xml", data: "Zm9v" },
        ]}
      />,
    );

    expect(html).toContain('alt="Chart preview"');
    expect(html).toContain('src="data:image/svg+xml;base64,Zm9v"');
    expect(html).toContain("max-h-40");
    expect(html).toContain("Q4 chart");
  });
});

describe("ToolDetailRow", () => {
  it("discloses input and result payloads when expanded", () => {
    const html = renderToStaticMarkup(
      <ToolDetailRow
        defaultOpen
        detail={{
          input: { query: "portfolio news" },
          result: { summary: "found context" },
        }}
        name="Mock web search"
        state="success"
      />,
    );

    expect(html).toContain('data-slot="tool-detail-row"');
    expect(html).toContain("Input");
    expect(html).toContain("portfolio news");
    expect(html).toContain("Result");
    expect(html).toContain("found context");
  });

  it("leads a resolved host command with its status line", () => {
    const html = renderToStaticMarkup(
      <ToolDetailRow
        defaultOpen
        detail={{
          statusLine: "applied · resource_opened",
          input: { resourceId: "ticket-4821" },
        }}
        name="Open resource"
        state="success"
      />,
    );

    expect(html).toContain("applied · resource_opened");
    expect(html).toContain("ticket-4821");
  });

  it("marks a failed call distinctly with its error code", () => {
    const html = renderToStaticMarkup(
      <ToolDetailRow
        defaultOpen
        detail={{ errorCode: "tool_failed", input: { path: "/reports" } }}
        name="Read file"
        state="error"
      />,
    );

    expect(html).toContain('data-state="error"');
    expect(html).toContain("tool_failed");
    expect(html).toContain("sc-error-glyph");
  });
});
