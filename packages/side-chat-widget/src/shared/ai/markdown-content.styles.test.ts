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
  "--message-code-block-pad",
  "--message-code-block-radius",
  "--message-code-font-size",
  "--message-list-indent",
  "--message-heading-gap-before",
  "--message-heading-gap-after",
  "--message-heading-weight",
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
});
