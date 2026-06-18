"use client";

/**
 * §8.15 — Collapsible.
 *
 * Built on Base UI `Collapsible`, which owns the open/close + height animation
 * contract. The panel animates from Base UI's exposed `--collapsible-panel-height`
 * through the `sc-collapsible-panel` hook class — never a JS `scrollHeight` measure.
 * Controlled `open` lets a parent (e.g. the Reasoning fold, §9) auto-collapse when
 * the answer starts. The chevron rotates via the `panelopen:` variant.
 */
import { useState, type ReactElement, type ReactNode } from "react";

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

export function CollapsibleSection(): ReactElement {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex flex-col gap-4">
      <CollapsibleFold open={open} onOpenChange={setOpen} label="Reasoning">
        <div className="flex flex-col gap-1 py-2 pl-3">
          <p className="text-sm text-foreground">Reading the conversation context.</p>
          <p className="text-sm text-muted-foreground">Checking the requested file paths.</p>
          <p className="text-sm text-muted-foreground">Drafting a minimal, 1:1 answer.</p>
        </div>
      </CollapsibleFold>

      <p className="text-xs text-muted-foreground">
        Panel is currently {open ? "open" : "closed"} — height animates via{" "}
        <code className="text-foreground">--collapsible-panel-height</code>.
      </p>
    </div>
  );
}

export { CollapsibleFold as Collapsible };
