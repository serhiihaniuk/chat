"use client";

/**
 * §8.14 — Separator.
 *
 * Thin rule built on Base UI's Separator so it carries `role=separator` (and the
 * matching `aria-orientation`) instead of an inert styled <div>. Consumers usually
 * inline a bare `<Separator orientation=… className="… bg-border" />`; this wrapper
 * just defaults the orientation-driven sizing so the common case stays one line.
 */
import type { ReactElement } from "react";

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "#shared/lib/cn";

function Separator({ className, orientation = "horizontal", ...props }: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export function SeparatorSection(): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      {/* Horizontal: rule between two stacked text blocks */}
      <div className="flex flex-col">
        <p className="text-sm text-foreground">Conversation settings</p>
        <Separator orientation="horizontal" className="my-1.5 h-px bg-border" />
        <p className="text-xs text-muted-foreground">Changes apply to new messages only.</p>
      </div>

      {/* Vertical: rule between two inline items in a flex row */}
      <div className="flex items-center text-sm text-muted-foreground">
        <span>Drafts</span>
        <Separator orientation="vertical" className="mx-1.5 w-px self-stretch bg-border" />
        <span>Archived</span>
      </div>
    </div>
  );
}

export { Separator };
