/**
 * §8.5 Media (avatar).
 *
 * A fixed-size square leading graphic. The `sc-media` hook class owns the size,
 * radius, background and foreground tokens plus centering — so the component never
 * sets colour or dimensions itself. Children may be 1–2 initials, a lucide glyph,
 * or an <img className="size-full object-cover"> that fills the square.
 */
import type { ComponentPropsWithoutRef, ReactElement } from "react";

import { cn } from "#shared/lib/cn";
import { Sparkles, Wrench } from "lucide-react";

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

// A self-contained inline placeholder so the <img> demo needs no external URL.
// Uses currentColor only, so it inherits the token-driven foreground from sc-media.
const PLACEHOLDER_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="currentColor">' +
      '<rect width="64" height="64" opacity="0.12"/>' +
      '<circle cx="32" cy="24" r="11"/>' +
      '<path d="M11 57a21 21 0 0 1 42 0z"/></svg>',
  );

export function MediaSection(): ReactElement {
  return (
    <div className="flex items-center gap-3">
      <Media>AB</Media>
      <Media>
        <Sparkles className="size-4" />
      </Media>
      <Media>
        <Wrench className="size-4" />
      </Media>
      <Media>
        <img src={PLACEHOLDER_SVG} alt="avatar" className="size-full object-cover" />
      </Media>
    </div>
  );
}
