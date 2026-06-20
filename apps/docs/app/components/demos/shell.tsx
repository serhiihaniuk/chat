/**
 * Demo for "Shell, rail & header".
 *
 * Renders the REAL Shell composition (rail + header + native message log +
 * composer) framed inside a floating-panel surface, exactly the way the live
 * widget mounts it. A second state isolates the SidebarRail so the rail/header
 * anatomy reads on its own.
 *
 * Lives inside <Preview>'s shadow root (only the widget's compiled CSS is in
 * scope), so this file's OWN wrappers use inline styles + widget tokens. The
 * widget components carry their own appearance. `sc-widget-panel` is a real
 * compiled widget class (it establishes the `side-chat-widget` inline-size
 * container the composer's slots react to), so it is applied via className.
 */
import type { CSSProperties } from "react";

import { Shell, SidebarRail } from "@side-chat/side-chat-widget/ui/shell";

const stack: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
  width: "100%",
  maxWidth: "42rem",
};

const label: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 500,
  color: "var(--muted-foreground)",
};

const panel: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  width: "100%",
  height: "24rem",
  borderRadius: "var(--radius-xl)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--foreground)",
  boxShadow: "var(--shadow-panel)",
};

const railFrame: CSSProperties = {
  height: "20rem",
  width: "15.5rem",
  overflow: "hidden",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--sidebar-border)",
};

export function ShellDemo() {
  return (
    <div style={stack}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <span style={label}>Full panel — rail, header, message log, composer</span>
        <div className="sc-widget-panel" style={panel}>
          <Shell />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <span style={label}>Sidebar rail in isolation</span>
        <div style={railFrame}>
          <SidebarRail />
        </div>
      </div>
    </div>
  );
}
