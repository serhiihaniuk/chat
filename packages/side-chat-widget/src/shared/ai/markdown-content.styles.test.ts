import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");
const markdownStart = styles.indexOf("@utility sc-markdown");
const markdownEnd = styles.indexOf(
  "/* ============================================================================",
  markdownStart,
);
const markdownStyles = styles.slice(markdownStart, markdownEnd);

const MARKDOWN_COMPONENT_TOKENS = [
  "--message-block-gap",
  "--message-item-gap",
  "--message-leading",
  "--message-link-foreground",
  "--message-link-underline-offset",
  "--message-markdown-border",
  "--message-markdown-border-width",
  "--message-muted-background",
  "--message-muted-foreground",
  "--message-inline-code-px",
  "--message-inline-code-py",
  "--message-inline-code-radius",
  "--message-code-block-frame-pad",
  "--message-code-block-gap",
  "--message-code-block-header-height",
  "--message-code-block-placeholder-height",
  "--message-code-block-pad",
  "--message-code-block-radius",
  "--message-code-font-size",
  "--message-list-indent",
  "--message-ordered-list-indent",
  "--message-heading-gap-before",
  "--message-heading-gap-after",
  "--message-heading-weight",
  "--message-heading-1-font-size",
  "--message-heading-2-font-size",
  "--message-heading-3-font-size",
  "--message-heading-line-height",
  "--message-quote-border-width",
  "--message-quote-indent",
  "--message-table-font-size",
  "--message-table-cell-px",
  "--message-table-cell-py",
] as const;

describe("Streamdown message token contract", () => {
  it("declares and consumes every Markdown component token", () => {
    expect(markdownStart).toBeGreaterThan(-1);
    expect(markdownEnd).toBeGreaterThan(markdownStart);

    for (const token of MARKDOWN_COMPONENT_TOKENS) {
      expect(styles).toContain(`${token}:`);
      expect(markdownStyles).toContain(`var(${token})`);
    }
  });

  it("does not restore the raw spacing utilities replaced by the component tokens", () => {
    expect(markdownStyles).not.toMatch(
      /\b(?:px-1|py-0\.5|p-3|pl-5|mt-4|mb-2|border-l-2|pl-3|px-2|py-1)\b/u,
    );
  });

  it("keeps multi-digit ordered-list markers inside a wider tokenized gutter", () => {
    expect(styles).toContain("--message-ordered-list-indent: calc(var(--spacing) * 12);");
    expect(markdownStyles).toContain(
      "& :where(ul) {\n    margin-block: var(--message-block-gap);\n    padding-inline-start: var(--message-list-indent);",
    );
    expect(markdownStyles).toContain(
      "& :where(ol) {\n    margin-block: var(--message-block-gap);\n    padding-inline-start: var(--message-ordered-list-indent);",
    );
  });

  it("maps each compact heading tier to its documented message token", () => {
    expect(styles).toContain("--message-heading-gap-before: calc(var(--spacing) * 6);");
    expect(styles).toContain("--message-heading-gap-after: calc(var(--spacing) * 3);");
    expect(markdownStyles).toContain(
      ".sc-message-heading-1 {\n    font-size: var(--message-heading-1-font-size);",
    );
    expect(markdownStyles).toContain(
      ".sc-message-heading-2 {\n    font-size: var(--message-heading-2-font-size);",
    );
    expect(markdownStyles).toContain(
      ".sc-message-heading-3 {\n    font-size: var(--message-heading-3-font-size);",
    );
  });

  it("owns Streamdown fenced-code layout through stable data hooks", () => {
    expect(markdownStyles).toContain('& [data-streamdown="code-block"] {');
    expect(markdownStyles).toContain(
      "contain-intrinsic-size: auto var(--message-code-block-placeholder-height) !important;",
    );
    expect(markdownStyles).toMatch(
      /&\s+\[data-streamdown="code-block"\]\s+>\s+:has\(>\s+\[data-streamdown="code-block-actions"\]\)\s+\{/u,
    );
    expect(markdownStyles).toContain('& [data-streamdown="code-block-body"] > pre {');
    expect(markdownStyles).toContain('& [data-streamdown="code-block-actions"] svg {');
    expect(markdownStyles).toContain("width: var(--size-icon-sm);");
  });

  it("keeps provider-authored reasoning emphasis at the normal trace weight", () => {
    expect(styles).toContain("--reasoning-thought-weight: var(--weight-normal);");
    expect(styles).toContain("@utility sc-reasoning-markdown {");
    expect(styles).toContain('& [data-streamdown="strong"] {');
    expect(styles).toContain("font-weight: var(--reasoning-thought-weight);");
  });
});
