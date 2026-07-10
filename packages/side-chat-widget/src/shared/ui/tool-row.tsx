/**
 * §9.9 — Tool row: a compact status line inside Reasoning.
 *
 * Show one status icon followed by the tool name as plain text. This is
 * informational, not interactive, so it stays a plain `<div>` with no pill or
 * wrench icon. Only the icon changes color.
 *
 * The activity timeline supplies the state:
 * - `running` → spinning `Loader2`
 * - `success` → `Check`
 * - `error` → `TriangleAlert`, styled by `sc-error-glyph`
 */
import type { ReactElement } from "react";

import { Check, Loader2, TriangleAlert } from "lucide-react";

export type ToolState = "running" | "success" | "error";

function ToolGlyph({ state }: { state: ToolState }): ReactElement {
  if (state === "success") {
    return <Check className="size-3.5 shrink-0 text-success" />;
  }
  if (state === "error") {
    return <TriangleAlert className="sc-error-glyph size-3.5 shrink-0" />;
  }
  return <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />;
}

function ToolRow({ name, state }: { name: string; state: ToolState }): ReactElement {
  return (
    <div data-slot="tool-row" data-state={state} className="flex items-center gap-2">
      <ToolGlyph state={state} />
      <span className="text-sm font-medium text-foreground">{name}</span>
    </div>
  );
}

// ToolGlyph is shared with the expandable detail row (#shared/ui/activity/tool-detail)
// so both rows keep one status-glyph vocabulary.
export { ToolGlyph, ToolRow };
