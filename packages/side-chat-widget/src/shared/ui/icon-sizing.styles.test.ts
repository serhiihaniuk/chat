import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");
const headerSource = readFileSync(
  new URL("../../features/panel/ui/widget-frame.tsx", import.meta.url),
  "utf8",
);
const noticeSource = readFileSync(new URL("./error-notice.tsx", import.meta.url), "utf8");
const reasoningSource = readFileSync(new URL("./reasoning.tsx", import.meta.url), "utf8");
const citationsSource = readFileSync(new URL("./activity/citations.tsx", import.meta.url), "utf8");
const workflowTimelineSource = readFileSync(
  new URL("../../features/workflow-chat/ui/workflow-message-timeline.tsx", import.meta.url),
  "utf8",
);
const workflowToolSource = readFileSync(
  new URL("../../features/workflow-chat/ui/workflow-tool-presentation.tsx", import.meta.url),
  "utf8",
);

describe("shared icon size contract", () => {
  it("defines named compact and standard glyph tiers", () => {
    expect(styles).toContain("--size-icon-sm: 0.875rem;");
    expect(styles).toContain("--size-icon-md: 1rem;");
    expect(styles).toContain("@utility size-icon-sm {");
    expect(styles).toContain("@utility size-icon-md {");
  });

  it("uses the standard tier for header chrome and compact tier for notices", () => {
    expect(headerSource).toContain("size-icon-md");
    expect(headerSource).not.toContain("size-4");
    expect(noticeSource).toContain("size-icon-sm");
    expect(noticeSource).not.toMatch(/\bsize-(?:3\.5|4)\b/u);
  });

  it("normalizes project and Streamdown action glyphs to the compact tier", () => {
    expect(styles).toMatch(
      /@utility sc-action \{[\s\S]*?& > svg \{[\s\S]*?width: var\(--size-icon-sm\);[\s\S]*?height: var\(--size-icon-sm\);/u,
    );
    expect(styles).toMatch(
      /\[data-streamdown="code-block-actions"\] svg \{[\s\S]*?width: var\(--size-icon-sm\);[\s\S]*?height: var\(--size-icon-sm\);/u,
    );
  });

  it("uses semantic icon tiers across message activity surfaces", () => {
    for (const source of [
      reasoningSource,
      citationsSource,
      workflowTimelineSource,
      workflowToolSource,
    ]) {
      expect(source).toContain("size-icon-sm");
      expect(source).not.toMatch(/\bsize-(?:2\.5|3\.5|4)\b/u);
    }
  });

  it("centers the one-pixel reasoning rule beneath its compact icon", () => {
    expect(styles).toContain("--collapsible-rule-width: 1px;");
    expect(styles).toMatch(
      /--reasoning-rule-offset:\s*calc\(\s*var\(--size-icon-sm\) \/ 2 - var\(--collapsible-rule-width\) \/ 2\s*\);/u,
    );
    expect(styles).toMatch(
      /@utility sc-collapsible-panel \{[\s\S]*?border-left-width: var\(--collapsible-rule-width\);[\s\S]*?border-left-style: solid;/u,
    );
    expect(reasoningSource).toContain(
      'className="sc-collapsible-panel ml-(--reasoning-rule-offset)"',
    );
    expect(reasoningSource).not.toContain("ml-2");
  });
});
