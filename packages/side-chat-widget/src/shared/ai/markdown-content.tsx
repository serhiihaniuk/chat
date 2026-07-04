/**
 * §10 — Markdown / Streamdown wrapper.
 *
 * The ONE wrapper every assistant message renders through (never raw `<Streamdown>`).
 * We do NOT parse Markdown ourselves — Streamdown owns parsing, GFM, sanitization,
 * Shiki, link safety and incomplete-stream repair. All kit customization lives here.
 *
 * The `.sc-markdown` hook class styles Streamdown's rendered DOM (code/links/tables/
 * lists/headings) through tokens, so this file adds NO one-off colours.
 */
import type { ReactElement } from "react";

import { Streamdown } from "streamdown";

export type MarkdownMode = "streaming" | "static";

export function MarkdownContent({
  children,
  mode = "static",
}: {
  children: string;
  /** `streaming` = live turn (repairs half-written fences/tables); `static` = history. */
  mode?: MarkdownMode;
}): ReactElement {
  return (
    <div className="sc-markdown">
      <Streamdown
        mode={mode}
        // Repair is gated on `mode`: only a live stream may have an unclosed
        // fence/table to mend; history is already complete, so leave it verbatim.
        parseIncompleteMarkdown={mode === "streaming"}
        dir="auto"
      >
        {children}
      </Streamdown>
    </div>
  );
}
