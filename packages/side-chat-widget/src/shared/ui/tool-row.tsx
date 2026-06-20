/**
 * §9.9 — Tool row.
 *
 * A compact line inside the Reasoning panel: a leading status glyph then the tool
 * name as PLAIN text — no pill, no wrench (matching the design tokens). The name is
 * --tool-label-fg (foreground) at --tool-label-size (text-sm), weight 500; only the
 * glyph carries colour. Informational, not interactive — a plain <div>.
 *
 *   running -> spinning Loader2, --tool-running-fg (primary)
 *   success -> Check,          --tool-done-fg (success)
 *   error   -> TriangleAlert, tinted via the sc-error-glyph hook class
 *             (destructive mixed into muted — there is no destructive-foreground)
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

export function ToolRowSection(): ReactElement {
  return (
    <div className="flex flex-col gap-2.5">
      <ToolRow name="search_web" state="running" />
      <ToolRow name="read_file" state="success" />
      <ToolRow name="run_tests" state="error" />
    </div>
  );
}

export { ToolRow };
