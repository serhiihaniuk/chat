/**
 * Row demo — renders the REAL Row pattern the same way its in-source `RowSection`
 * does. Row is a BASE-UI-DIRECT primitive: Row calls it a className PATTERN, not
 * its own Base UI part. The file ships the reusable `rowBaseClass` plus a single
 * `RowSection` that shows the two contract forms side by side, so the demo mounts
 * that Section rather than re-implementing raw Base UI.
 *
 * The Section owns everything the pattern depends on — form A is a Base UI
 * `Select.Item` (active via `highlighted:`, trailing check via `selected:` on the
 * ItemIndicator) whose popup `usePortalContainer()`s into the widget root; form B is
 * a standalone conversation `<button>` (active via `aria-current`, trailing dot). Both
 * carry the load-bearing `min-w-0` + `truncate` truncation rule and keep the trailing
 * indicator in the DOM at `opacity-0` so selection never reflows. It renders inside
 * <Preview>'s shadow root, styled only by the widget's compiled CSS, which is exactly
 * what the Section assumes. The wrapper here adds nothing but an inline-styled caption
 * using widget tokens.
 */
import type { ReactElement } from "react";

import { RowSection } from "@side-chat/side-chat-widget/ui/row";

export function RowDemo(): ReactElement {
  return (
    <div style={{ width: "100%", maxWidth: "30rem" }}>
      <span
        style={{
          display: "block",
          marginBottom: "0.5rem",
          fontSize: "0.75rem",
          color: "var(--muted-foreground)",
        }}
      >
        The same line layout in both forms — a Base UI item (open the select; the
        highlight follows pointer and keyboard, the check marks the selected model) and a
        standalone conversation button (click a row; <code>aria-current</code> reveals the
        trailing dot). Long titles truncate instead of widening the panel.
      </span>
      <RowSection />
    </div>
  );
}
