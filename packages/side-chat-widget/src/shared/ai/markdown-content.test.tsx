import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "./markdown-content.js";

const render = (markdown: string): string =>
  renderToStaticMarkup(<MarkdownContent mode="static">{markdown}</MarkdownContent>);

describe("MarkdownContent citations", () => {
  const withCitations = [
    "Habits shape behavior [^1], and boredom fuels creativity [^2].",
    "",
    "[^1]: Smith, J. (2022). Introduction to Testing. https://example.com/smith",
    "[^2]: [Boredom & Creativity](https://journals.test/boredom)",
  ].join("\n");

  it("renders each footnote reference as an inline citation chip", () => {
    const html = render(withCitations);
    expect((html.match(/data-slot="citation-ref"/gu) ?? []).length).toBe(2);
    // The chip shows the author's number.
    expect(html).toMatch(/data-slot="citation-ref"[^>]*>1</u);
  });

  it("suppresses Streamdown's default footnotes block (the fold renders in the message view)", () => {
    const html = render(withCitations);
    expect(html).not.toContain("data-footnotes");
    // The wrapper only owns the inline chips; the "N sources" fold is a sibling of
    // the answer in the message view, so one flex gap spaces it like reasoning.
    expect(html).not.toContain('data-slot="sources-fold"');
    // The generated answer text stays; only the trailing footnotes block is dropped.
    expect(html).toContain("Habits shape behavior");
  });

  it("leaves an answer with no citations untouched (no chips)", () => {
    const html = render("Just a plain answer with no sources.");
    expect(html).not.toContain('data-slot="citation-ref"');
    expect(html).toContain("Just a plain answer");
  });
});

describe("MarkdownContent typography", () => {
  it("replaces Streamdown document heading sizes with compact widget heading classes", () => {
    const html = render("# One\n\n## Two\n\n### Three\n\n#### Four");

    expect(html).toContain('class="sc-message-heading-1"');
    expect(html).toContain('class="sc-message-heading-2"');
    expect((html.match(/class="sc-message-heading-3"/gu) ?? []).length).toBe(2);
    expect(html).not.toMatch(/text-(?:xl|2xl|3xl|4xl)/u);
  });
});

describe("MarkdownContent code controls", () => {
  it("keeps Copy and removes Download from fenced code blocks", () => {
    const html = render("```text\nconst answer = 42;\n```");

    expect(html).toContain("Copy Code");
    expect(html).not.toContain("Download file");
  });
});
