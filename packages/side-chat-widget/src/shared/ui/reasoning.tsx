"use client";

/**
 * Reasoning: the foldable thinking trace.
 *
 * Base UI `Collapsible` contains thought lines and `<ToolRow>` entries
 * (tool rows) as siblings in stream order. Tools stay where they happened; they are
 * not moved into a separate block below the answer. The header pulses while the
 * model is thinking, and the chevron follows the controlled open state.
 *
 * The parent controls open state so it can expand live thinking, collapse a
 * trace locally, and reopen it when a new live trace arrives. The panel height uses
 * Base UI's `--collapsible-panel-height` through `sc-collapsible-panel`; no
 * JavaScript `scrollHeight` measurement is needed.
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
  renderThought,
}: {
  items: readonly ReasoningItem[];
  label: string;
  thinking?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renderThought?: ((text: string) => ReactNode) | undefined;
}): ReactElement {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}>
      <Collapsible.Trigger className="flex items-center gap-2 text-sm text-muted-foreground">
        <Brain className="size-icon-sm" />
        {/* Own state: shimmer the label while still thinking. */}
        <span className={cn(thinking && "animate-pulse")}>{label}</span>
        <ChevronDown
          className={cn("size-icon-sm transition-transform ease-out", open && "rotate-180")}
        />
      </Collapsible.Trigger>
      <Collapsible.Panel className="sc-collapsible-panel ml-2">
        <div className="flex flex-col gap-2.5 py-2 pl-3.5">
          {items.map((item) => (
            <ReasoningEntry key={item.id} item={item} renderThought={renderThought} />
          ))}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

const ReasoningEntry = ({
  item,
  renderThought,
}: {
  item: ReasoningItem;
  renderThought: ((text: string) => ReactNode) | undefined;
}): ReactNode => {
  if (item.kind === "thought") {
    return (
      <div className="sc-reasoning-markdown" data-slot="reasoning-thought">
        {renderThought ? (
          renderThought(item.text)
        ) : (
          <p className="text-sm text-muted-foreground">{item.text}</p>
        )}
      </div>
    );
  }
  if (item.kind === "tool") {
    return <ToolRow name={item.name} state={item.state} />;
  }
  return item.node;
};
