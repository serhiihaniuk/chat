/**
 * Demo for "Scroll area".
 *
 * Renders the REAL ScrollArea wrapper (§8.3) — the Base UI Root → Viewport →
 * Scrollbar → Thumb tree with a vertical overlay scrollbar. The `className`
 * passed to ScrollArea styles the Viewport, so callers give it the border /
 * radius; the overlay scrollbar fades when idle and surfaces on hover/scroll,
 * driven purely from CSS keyed on Base UI's data attributes.
 *
 * Two states: a bordered panel of many rows (overflows, so the thumb appears)
 * and a short list that fits (no thumb — the area is still bounded).
 *
 * Lives inside <Preview>'s shadow root (only the widget's compiled CSS is in
 * scope), so this file's OWN wrappers use inline styles + widget tokens. The
 * ScrollArea carries its own compiled classes.
 */
import type { CSSProperties } from "react";

import { ScrollArea } from "@side-chat/side-chat-widget/ui/scroll-area";

const stack: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
};

const block: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const label: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 500,
  color: "var(--muted-foreground)",
};

const frame: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "12rem",
};

const shortFrame: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "12rem",
};

const viewport: CSSProperties = {
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border)",
  background: "var(--sc-canvas)",
};

const content: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 2)",
  padding: "calc(var(--spacing) * 3)",
};

const rowText: CSSProperties = {
  fontSize: "0.8125rem",
  color: "var(--muted-foreground)",
};

const overflowingRows = Array.from(
  { length: 24 },
  (_, i) => `Scrollable row ${i + 1}`,
);

const fittingRows = ["First item", "Second item", "Third item", "Fourth item"];

export function ScrollAreaDemo() {
  return (
    <div style={stack}>
      <div style={block}>
        <span style={label}>Overflowing — overlay thumb on hover / scroll</span>
        <div style={frame}>
          <ScrollArea className="rounded-lg border border-border">
            <div style={content}>
              {overflowingRows.map((row) => (
                <p key={row} style={rowText}>
                  {row}
                </p>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      <div style={block}>
        <span style={label}>Content fits — bounded, no scrollbar</span>
        <div style={shortFrame}>
          {/* Inline styles on the wrapper frame; the viewport border/radius is
              applied via the ScrollArea className so it styles the Viewport. */}
          <div style={viewport}>
            <ScrollArea>
              <div style={content}>
                {fittingRows.map((row) => (
                  <p key={row} style={rowText}>
                    {row}
                  </p>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
