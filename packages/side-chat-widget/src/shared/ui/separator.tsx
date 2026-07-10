"use client";

/**
 * Separator.
 *
 * Thin rule built on Base UI's Separator so it carries `role=separator` (and the
 * matching `aria-orientation`) instead of an inert styled <div>. Consumers usually
 * inline a bare `<Separator orientation=… className="… bg-border" />`; this wrapper
 * just defaults the orientation-driven sizing so the common case stays one line.
 */
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

export { Separator };
