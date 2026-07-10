/**
 * Badge & Suggestion (plain markup, no Base UI).
 *
 * Badge   = a NON-interactive status pill (<span>). No hover/focus affordance —
 *           it conveys state, it is not actionable.
 * Suggestion = an interactive chip (<button>) — a Row in pill form. Real button,
 *           keyboard-focusable; `hover:` is allowed here because it IS interactive.
 *
 * These two must never be merged: a status pill that is focusable lies to the user,
 * and a suggestion that is a <span> is invisible to the keyboard.
 */
import type { ComponentPropsWithoutRef, ReactElement } from "react";

import { cn } from "#shared/lib/cn";

function Badge({ className, ...props }: ComponentPropsWithoutRef<"span">): ReactElement {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-2xs font-semibold text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function Suggestion({
  className,
  type = "button",
  ...props
}: ComponentPropsWithoutRef<"button">): ReactElement {
  return (
    <button
      type={type}
      data-slot="suggestion"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-accent",
        className,
      )}
      {...props}
    />
  );
}

export { Badge, Suggestion };
