"use client";

/**
 * Collapsible.
 *
 * Built on Base UI `Collapsible`, which owns the open/close + height animation
 * contract. The panel animates from Base UI's exposed `--collapsible-panel-height`
 * through the `sc-collapsible-panel` hook class — never a JS `scrollHeight` measure.
 * Controlled `open` lets a parent, such as the Reasoning fold, auto-collapse when
 * the answer starts. The chevron rotates via the `panelopen:` variant.
 */
import { type ReactElement, type ReactNode } from "react";

import { Collapsible } from "@base-ui/react/collapsible";
import { Brain, ChevronDown } from "lucide-react";

function CollapsibleFold({
  open,
  onOpenChange,
  label,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}>
      <Collapsible.Trigger className="flex items-center gap-2 text-sm text-muted-foreground">
        <Brain className="size-4" />
        <span>{label}</span>
        <ChevronDown className="size-4 transition-transform ease-out panelopen:rotate-180" />
      </Collapsible.Trigger>
      <Collapsible.Panel className="sc-collapsible-panel">{children}</Collapsible.Panel>
    </Collapsible.Root>
  );
}

export { CollapsibleFold as Collapsible };
