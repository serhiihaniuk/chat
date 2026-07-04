"use client";

/**
 * §9.8 — Reasoning.
 *
 * A foldable thinking trace built on Base UI `Collapsible` (§8.15) whose panel
 * interleaves thought lines and `<ToolRow>` entries (§9.9) as SIBLINGS, in stream
 * order — never a separate tool block below the answer. The header label shimmers
 * (a subtle `animate-pulse`) while the model is still thinking, and the chevron
 * follows this component's controlled open state.
 *
 * Open state is controlled so a parent can expand live thinking, collapse
 * completed minimal traces, or keep detailed traces open while leaving the
 * trigger user-toggleable.
 * Panel height animates from Base UI's exposed `--collapsible-panel-height`
 * through the `sc-collapsible-panel` hook class — no JS `scrollHeight` measure.
 */
import { type ReactElement, type ReactNode } from "react";

import { Collapsible } from "@base-ui/react/collapsible";
import { Brain, ChevronDown } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { ToolRow, type ToolState } from "#shared/ui/tool-row";

/**
 * One entry in the trace: a plain thought line, a compact tool invocation, or a
 * pre-built node (an expandable tool-detail row, or a host-supplied custom
 * rendering from the widget's `renderActivityItem` seam).
 */
export type ReasoningItem =
  | { kind: "thought"; id: string; text: string }
  | { kind: "tool"; id: string; name: string; state: ToolState }
  | { kind: "node"; id: string; node: ReactNode };

export function Reasoning({
  items,
  label,
  thinking = false,
  open,
  onOpenChange,
}: {
  items: readonly ReasoningItem[];
  label: string;
  thinking?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}>
      <Collapsible.Trigger className="flex items-center gap-2 text-sm text-muted-foreground">
        <Brain className="size-4" />
        {/* Own state: shimmer the label while still thinking. */}
        <span className={cn(thinking && "animate-pulse")}>{label}</span>
        <ChevronDown className={cn("size-4 transition-transform ease-out", open && "rotate-180")} />
      </Collapsible.Trigger>
      <Collapsible.Panel className="sc-collapsible-panel ml-2">
        <div className="flex flex-col gap-2.5 py-2 pl-3.5">
          {items.map((item) => (
            <ReasoningEntry key={item.id} item={item} />
          ))}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

const ReasoningEntry = ({ item }: { item: ReasoningItem }): ReactNode => {
  if (item.kind === "thought") {
    return <p className="text-sm text-muted-foreground">{item.text}</p>;
  }
  if (item.kind === "tool") {
    return <ToolRow name={item.name} state={item.state} />;
  }
  return item.node;
};
