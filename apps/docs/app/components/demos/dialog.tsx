/**
 * Dialog demo — renders the REAL `DialogSection` from the widget.
 *
 * Dialog (§8.16) is the panel-scoped modal: `WidgetDialog` portals its backdrop
 * and popup into the widget root (`usePortalContainer()`) and positions them
 * absolute, so the overlay covers the widget panel — never the embedding page —
 * and clips to the panel's rounded corners. Surface + motion are owned by
 * styles.css via the `dialog-backdrop` / `dialog-content` slots. The section is
 * the contract-styled usage (a confirm with ghost/primary actions); we render it
 * verbatim.
 *
 * It lives inside <Preview>'s shadow root (styled only by the widget's compiled
 * CSS), so the wrapper's own caption uses inline styles + widget tokens.
 */
import type { ReactElement } from "react";

import { DialogSection } from "@side-chat/side-chat-widget/ui/dialog";

export function DialogDemo(): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        color: "var(--foreground)",
      }}
    >
      <DialogSection />
      <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0 }}>
        The dialog overlays the preview panel, not this page — the backdrop and popup
        are portaled into the widget root and positioned absolute.
      </p>
    </div>
  );
}
