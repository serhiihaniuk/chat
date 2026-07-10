/**
 * Select demo (Select) — renders the REAL non-searchable dropdown the same way its
 * in-source `SelectSection` does. Select is a BASE-UI-DIRECT primitive: the file ships
 * no reusable wrapper, only the `SelectSection` (the Settings "Default model" picker) as
 * the 1:1 contract reference, so the demo simply mounts that Section.
 *
 * The Section owns everything — the Base UI `Select.Root` value/typeahead behavior, the
 * `usePortalContainer()` popup that portals into the widget root (so it keeps theme + font),
 * and the `data-slot="select-content"` skin — and needs no props (it seeds its own model
 * list and selection). It renders inside <Preview>'s shadow root, styled only by the widget's
 * compiled CSS, which is exactly what the Section assumes. The wrapper here adds nothing but
 * an inline-styled caption using widget tokens.
 */
import type { ReactElement } from "react";

import { SelectSection } from "@side-chat/side-chat-widget/ui/select";

export function SelectDemo(): ReactElement {
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
        A plain value picker with no search field. Open it and Base UI sets the highlight on
        the active row; the selected row shows a check. The popup portals into the widget root.
      </span>
      <SelectSection />
    </div>
  );
}
