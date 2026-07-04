/**
 * §8.3 — Scroll area (bounded panels only, never the chat log).
 *
 * Base UI ScrollArea with an overlay scrollbar. The fade-when-idle behaviour lives
 * entirely in styles.css, keyed on Base UI's own data attributes on the scrollbar
 * (data-orientation / data-hovering / data-scrolling) — nothing drives it from JSX.
 * The `data-slot` hooks on the scrollbar + thumb carry that overlay styling.
 */
import { type ReactElement, type ReactNode } from "react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import { cn } from "#shared/lib/cn";

/**
 * Wraps a bounded, scrollable region. `className` styles the Viewport (the scrolling
 * surface) so callers can give it a border / radius / padding. Renders the full
 * Root > Viewport > Scrollbar > Thumb tree with a vertical overlay scrollbar.
 */
function ScrollArea({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <ScrollAreaPrimitive.Root className="relative size-full">
      <ScrollAreaPrimitive.Viewport className={cn("size-full outline-none", className)}>
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        data-slot="scroll-area-scrollbar"
        orientation="vertical"
        className="flex touch-none select-none p-px"
      >
        <ScrollAreaPrimitive.Thumb
          data-slot="scroll-area-thumb"
          className="relative flex-1 rounded-full bg-border"
        />
      </ScrollAreaPrimitive.Scrollbar>
    </ScrollAreaPrimitive.Root>
  );
}

export { ScrollArea };
