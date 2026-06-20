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
import { useState, type ReactElement } from "react";

import { Collapsible } from "@base-ui/react/collapsible";
import { Brain, ChevronDown } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { ToolRow, type ToolState } from "#shared/ui/tool-row";

/** One entry in the trace: either a plain thought line or a tool invocation. */
export type ReasoningItem =
  | { kind: "thought"; id: string; text: string }
  | { kind: "tool"; id: string; name: string; state: ToolState };

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
      <Collapsible.Panel className="sc-collapsible-panel">
        <div className="flex flex-col gap-2.5 py-2 pl-3.5">
          {items.map((item) =>
            item.kind === "thought" ? (
              <p key={item.id} className="text-sm text-muted-foreground">
                {item.text}
              </p>
            ) : (
              <ToolRow key={item.id} name={item.name} state={item.state} />
            ),
          )}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

const TRACE: ReasoningItem[] = [
  { kind: "thought", id: "t1", text: "Reading the conversation context and the user's request." },
  { kind: "tool", id: "x1", name: "search_files", state: "success" },
  { kind: "thought", id: "t2", text: "Cross-checking the matched paths before drafting a reply." },
  { kind: "tool", id: "x2", name: "read_file", state: "success" },
];

export function ReasoningSection(): ReactElement {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex flex-col gap-4">
      <Reasoning items={TRACE} label="Thought for 4s" open={open} onOpenChange={setOpen} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="self-start rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-accent"
      >
        {open ? "Collapse" : "Expand"} reasoning
      </button>
    </div>
  );
}
