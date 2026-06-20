/**
 * Tabs demo — renders the REAL Tabs composition inside <Preview>'s shadow root.
 *
 * Tabs is a BASE-UI-DIRECT primitive: the widget exposes no reusable wrapper, only
 * `TabsSection`, which is the exact, contract-correct usage — one `GROUPS` array drives
 * both the `Tabs.List` triggers and the sibling `Tabs.Panel`s, the active trigger is
 * expressed with the `selected:` variant, and every value is owned with `useState`. So
 * the demo renders that Section verbatim rather than re-implementing raw Base UI.
 *
 * The demo-level wrapper uses inline styles + widget tokens only; the Section styles
 * itself through the widget's compiled classes.
 */
import type { ReactElement } from "react";

import { TabsSection } from "@side-chat/side-chat-widget/ui/tabs";

export function TabsDemo(): ReactElement {
  return (
    <div style={{ width: "100%", maxWidth: "30rem" }}>
      <TabsSection />
    </div>
  );
}
