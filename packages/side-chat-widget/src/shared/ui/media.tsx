/**
 * Media (avatar).
 *
 * A fixed-size square leading graphic. The `sc-media` hook class owns the size,
 * radius, background and foreground tokens plus centering — so the component never
 * sets colour or dimensions itself. Children may be 1–2 initials, a lucide glyph,
 * or an <img className="size-full object-cover"> that fills the square.
 */
import type { ComponentPropsWithoutRef, ReactElement } from "react";

import { cn } from "#shared/lib/cn";

export function Media({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"span">): ReactElement {
  return (
    <span className={cn("sc-media", className)} {...props}>
      {children}
    </span>
  );
}
