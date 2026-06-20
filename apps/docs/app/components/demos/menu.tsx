/**
 * Menu / popover demo (§8.2) — renders the REAL <MenuSection> composition.
 *
 * Menu is BASE-UI-DIRECT: the source file exports no reusable wrapper, only the
 * `MenuSection` showcase that composes Base UI `Menu` parts directly and tags its
 * `Menu.Popup` with `data-slot="dropdown-menu-content"` to inherit the portaled
 * surface (border, bg-popover, shadow-popover, enter/exit scale+fade) from
 * styles.css. So this demo imports that Section verbatim rather than
 * re-implementing raw Base UI — the Section IS the contract-correct component.
 *
 * It renders inside <Preview>'s shadow root (styled only by the widget's compiled
 * CSS), so the wrapper's own caption uses inline styles + widget tokens. The popup
 * reads its portal container from the surrounding <SideChatWidgetRoot> the page
 * provides; the Section owns its own checkbox-item state internally.
 */
import { type ReactElement } from "react";

import { MenuSection } from "@side-chat/side-chat-widget/ui/menu";

export function MenuDemo(): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "0.75rem",
        maxWidth: "20rem",
        color: "var(--foreground)",
      }}
    >
      <MenuSection />
      <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0 }}>
        Click the trigger to open the menu — it carries an action item, a labelled
        group, and two checkbox items that stay open on toggle (<code>closeOnClick={"{false}"}</code>).
      </p>
    </div>
  );
}
