/**
 * Settings demo — renders the REAL settings panel inside <Preview>'s shadow root.
 *
 * `SettingsSection` is the widget's own self-contained showcase export: it mounts the
 * framed panel (header + responsive nav + the same Tabs.Panel set) and owns every bit
 * of state internally — selected group, theme, accent, corners, density, instructions,
 * send-on-Enter, and model — so it is fully interactive with sensible defaults and
 * needs no props. The frame carries `container: side-chat-widget`, so the group nav
 * flips between a left rail (wide) and a top Select (narrow) on its own width.
 *
 * Demo-level wrappers use inline styles + widget tokens only; the panel styles itself.
 */
import type { ReactElement } from "react";

import { SettingsSection } from "@side-chat/side-chat-widget/ui/settings";

export function SettingsDemo(): ReactElement {
  return (
    <div style={{ width: "100%", maxWidth: "48rem", marginInline: "auto" }}>
      <SettingsSection />
    </div>
  );
}
