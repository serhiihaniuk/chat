/**
 * Tooltip demo — renders the REAL `TooltipSection` from the widget.
 *
 * Tooltip is a BASE-UI-DIRECT primitive: the source file exports only a
 * `*Section` (a direct Base UI `Tooltip` composition — `Tooltip.Provider`,
 * `Root`, `Trigger`, `Portal`, `Positioner`, `Popup`) with no reusable wrapper,
 * so there is nothing to recompose here. `TooltipSection` IS the contract-styled
 * usage: three `sc-icon-btn` triggers (Settings / New chat / Close), each with an
 * `aria-label`, sharing one provider delay and portaling the popup into the
 * widget root's `usePortalContainer()` target. We render it verbatim.
 *
 * It lives inside <Preview>'s shadow root (styled only by the widget's compiled
 * CSS), so the wrapper's own caption uses inline styles + widget tokens.
 */
import type { ReactElement } from "react";

import { TooltipSection } from "@side-chat/side-chat-widget/ui/tooltip";

export function TooltipDemo(): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        color: "var(--foreground)",
      }}
    >
      <TooltipSection />
      <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0 }}>
        Hover or focus an icon button to reveal its label — the popup inherits the
        menu surface via the <code>tooltip-content</code> slot.
      </p>
    </div>
  );
}
