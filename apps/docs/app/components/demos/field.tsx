/**
 * Field demo — renders the REAL Field composition inside <Preview>'s shadow root.
 *
 * `Field` is a Base-UI-direct primitive: the source exports only `FieldSection`, which
 * IS the contract-correct usage (Field.Root / Label / Description / Control / Error,
 * with Base UI wiring the label↔control association and the `invalid:` variant). So we
 * render that Section verbatim rather than re-implementing raw Base UI parts.
 *
 * The Section walks three representative states — a single-line input, a textarea with
 * a description, and an invalid field with destructive error text. The demo-level
 * wrapper uses inline styles + widget tokens only; the Section styles itself.
 */
import type { ReactElement } from "react";

import { FieldSection } from "@side-chat/side-chat-widget/ui/field";

export function FieldDemo(): ReactElement {
  return (
    <div style={{ width: "100%", maxWidth: "26rem", marginInline: "auto" }}>
      <FieldSection />
    </div>
  );
}
