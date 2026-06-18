/**
 * §8.11 — Combobox (the searchable selector).
 *
 * The only primitive with a filter input. Filtering, highlight, and empty-state are
 * built into Base UI `Combobox`, so there is no manual query state: the built-in fuzzy
 * filter sets `highlighted:` on the match and `Combobox.Empty` renders the no-results
 * row. Rows reuse the Row + Media patterns (§8.4 / §8.5). The popup is portaled into the
 * widget root via `container={container}` (G5) and skinned through the
 * `data-slot="combobox-content"` CSS layer.
 *
 * Consumers drive Base UI `Combobox` directly with these conventions; the file ships the
 * `ComboboxSection` demo (a searchable model selector) as the 1:1 contract reference.
 */
import { useState, type ReactElement } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown, Search, Sparkles, Brain, Wrench, Globe } from "lucide-react";

import { usePortalContainer } from "#shared/ui/widget-root";

type Model = {
  id: string;
  name: string;
  desc: string;
  icon: ReactElement;
};

const MODELS = [
  { id: "sonnet", name: "Claude Sonnet", desc: "Balanced — everyday tasks", icon: <Sparkles className="size-4" /> },
  { id: "opus", name: "Claude Opus", desc: "Deepest reasoning, slower", icon: <Brain className="size-4" /> },
  { id: "haiku", name: "Claude Haiku", desc: "Fastest, lightweight", icon: <Sparkles className="size-4" /> },
  { id: "tools", name: "Agent (tools)", desc: "Calls tools and APIs", icon: <Wrench className="size-4" /> },
  { id: "web", name: "Web-grounded", desc: "Answers with live search", icon: <Globe className="size-4" /> },
  { id: "mini", name: "Mini", desc: "Tiny, on-device drafts", icon: <Sparkles className="size-4" /> },
] satisfies readonly Model[];

export function ComboboxSection(): ReactElement {
  const container = usePortalContainer();
  const [model, setModel] = useState<Model | null>(() => MODELS[0] ?? null);

  return (
    <div className="flex flex-col gap-4">
      <Combobox.Root
        items={MODELS}
        value={model}
        onValueChange={setModel}
        itemToStringLabel={(m: Model | null) => m?.name ?? ""}
        isItemEqualToValue={(a: Model | null, b: Model | null) => a?.id === b?.id}
        defaultOpen
      >
        <Combobox.Trigger className="sc-icon-btn w-full justify-between gap-1.5 px-3">
          <Combobox.Value>
            {(value: Model | null) => (
              <span className="flex items-center gap-2.5 truncate">
                <span className="sc-media">{value?.icon ?? <Sparkles className="size-4" />}</span>
                <span className="truncate text-sm font-medium text-foreground">
                  {value?.name ?? "Select model"}
                </span>
              </span>
            )}
          </Combobox.Value>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Combobox.Trigger>

        <Combobox.Portal container={container}>
          <Combobox.Positioner side="bottom" align="start" sideOffset={8}>
            <Combobox.Popup data-slot="combobox-content" className="w-menu max-w-full">
              <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <Combobox.Input
                  placeholder="Search models…"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              <Combobox.Empty className="sc-combo-empty">No models found.</Combobox.Empty>

              <Combobox.List className="max-h-64 overflow-auto p-1">
                {(m: Model) => (
                  <Combobox.Item
                    key={m.id}
                    value={m}
                    className="flex items-center gap-2.5 rounded-md px-2.5 py-2 highlighted:bg-accent"
                  >
                    <span className="sc-media">{m.icon}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-foreground">{m.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{m.desc}</span>
                    </span>
                    <Combobox.ItemIndicator className="ml-auto opacity-0 text-primary selected:opacity-100">
                      <Check className="size-4" />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>

      <p className="text-xs text-muted-foreground">
        Selected: <span className="font-medium text-foreground">{model?.name ?? "none"}</span>
      </p>
    </div>
  );
}
