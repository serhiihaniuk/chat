/**
 * Combobox demo — renders the REAL searchable selector the same way its in-source
 * `ComboboxSection` does. Combobox is a BASE-UI-DIRECT primitive: the file ships no
 * reusable wrapper, only the `ComboboxSection` (a model picker) as the 1:1 contract
 * reference, so the demo simply mounts that Section.
 *
 * The Section owns everything — the Base UI `Combobox.Root` filter/highlight/empty
 * behavior, the `usePortalContainer()` popup that portals into the widget root, and the
 * `data-slot="combobox-content"` skin — and needs no props (it seeds its own model list
 * and selection). It renders inside <Preview>'s shadow root, styled only by the widget's
 * compiled CSS, which is exactly what the Section assumes. The wrapper here adds nothing
 * but an inline-styled caption using widget tokens.
 */
import type { ReactElement } from "react";

import { ComboboxSection } from "@side-chat/side-chat-widget/ui/combobox";

export function ComboboxDemo(): ReactElement {
  return (
    <div style={{ width: "100%", maxWidth: "20rem" }}>
      <span
        style={{
          display: "block",
          marginBottom: "0.75rem",
          fontSize: "0.75rem",
          color: "var(--muted-foreground)",
        }}
      >
        Type to filter the model list — Base UI sets the highlight on the fuzzy match and
        renders the empty row when nothing matches. The popup portals into the widget root.
      </span>
      <ComboboxSection />
    </div>
  );
}
