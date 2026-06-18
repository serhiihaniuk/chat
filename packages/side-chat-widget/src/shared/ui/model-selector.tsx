/**
 * §9.4 — Model selector.
 *
 * One popup, two INDEPENDENT selections that never mix:
 *   - the model lives in the Base UI `Combobox` (it filters — hence a Combobox, not a
 *     Select). Rows reuse Media + the min-w-0/truncate Row pattern; the chosen row's
 *     `Combobox.ItemIndicator` reveals via `selected:`.
 *   - the thinking level lives in a `Segmented` (§8.8) pinned to the popup footer; its
 *     active item reads through `pressed:`.
 *
 * The two states are held in separate `useState`s and the trigger + footer always echo
 * the live model name and thinking level. The popup is portaled into the widget root via
 * `container={container}` (G5) and skinned through `data-slot="combobox-content"`.
 */
import { useState, type ReactElement } from "react";

import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown, Search, Sparkles, Brain, Wrench, Globe, Zap, Gauge } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { usePortalContainer } from "#shared/ui/widget-root";
import { Media } from "#shared/ui/media";
import { Segmented, type SegmentedItem } from "#shared/ui/segmented";

export type Model = {
  id: string;
  name: string;
  desc: string;
  icon: ReactElement;
};

type ThinkLevel = SegmentedItem & { desc: string };

const THINKING_LEVELS: ThinkLevel[] = [
  { id: "instant", label: "Instant", desc: "Fastest — no extra reasoning", Icon: Zap },
  { id: "balanced", label: "Balanced", desc: "Brief reasoning, everyday tasks", Icon: Gauge },
  { id: "extended", label: "Extended", desc: "Deep step-by-step for hard problems", Icon: Brain },
];

export function ModelSelector({
  models,
  defaultModel,
  defaultThinking = "instant",
}: {
  models: readonly Model[];
  defaultModel?: Model | undefined;
  defaultThinking?: string;
}): ReactElement {
  const container = usePortalContainer();
  const [model, setModel] = useState<Model | null>(
    () => defaultModel ?? models[0] ?? null,
  );
  const [thinking, setThinking] = useState<string>(defaultThinking);

  const selectedThink = THINKING_LEVELS.find((t) => t.id === thinking);
  const thinkingLabel = selectedThink?.label ?? thinking;
  const thinkingDesc = selectedThink?.desc ?? "";

  return (
    <Combobox.Root
      items={models}
      value={model}
      onValueChange={setModel}
      itemToStringLabel={(m: Model | null) => m?.name ?? ""}
      isItemEqualToValue={(a: Model | null, b: Model | null) => a?.id === b?.id}
    >
      <Combobox.Trigger className="sc-icon-btn w-auto gap-1.5 px-2">
        <Combobox.Value>
          {(value: Model | null) => (
            <span className="truncate text-sm font-medium text-foreground">
              {value?.name ?? "Select model"}
            </span>
          )}
        </Combobox.Value>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </Combobox.Trigger>

      <Combobox.Portal container={container}>
        <Combobox.Positioner side="top" align="end" sideOffset={8}>
          <Combobox.Popup data-slot="combobox-content" className="w-menu max-w-full">
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Combobox.Input
                placeholder="Search models…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <Combobox.Empty className="sc-combo-empty">
              No models found.
            </Combobox.Empty>

            <Combobox.List className="max-h-64 overflow-auto p-1">
              {(m: Model) => (
                <Combobox.Item
                  key={m.id}
                  value={m}
                  className="flex items-center gap-2.5 rounded-md px-2.5 py-2 highlighted:bg-accent"
                >
                  <Media>{m.icon}</Media>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {m.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {m.desc}
                    </span>
                  </span>
                  <Combobox.ItemIndicator className="ml-auto shrink-0 text-primary opacity-0 selected:opacity-100">
                    <Check className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>

            {/* Thinking — an INDEPENDENT selection; the header echoes the chosen
                level's description, the control is a vertical (stacked) Segmented. */}
            <div className="border-t border-border p-2">
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <span className="shrink-0 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  Thinking
                </span>
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {thinkingDesc}
                </span>
              </div>
              <Segmented
                stacked
                items={THINKING_LEVELS}
                value={thinking}
                onValueChange={setThinking}
              />
            </div>

            {/* Status — always echoes the live model + thinking selection. */}
            <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0 truncate">
                Using{" "}
                <span className="font-medium text-foreground">
                  {model?.name ?? "no model"}
                </span>{" "}
                · {thinkingLabel} thinking
              </span>
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

const MODELS: readonly Model[] = [
  { id: "sonnet", name: "Claude Sonnet", desc: "Balanced — everyday tasks", icon: <Sparkles className="size-4" /> },
  { id: "opus", name: "Claude Opus", desc: "Deepest reasoning, slower", icon: <Brain className="size-4" /> },
  { id: "haiku", name: "Claude Haiku", desc: "Fastest, lightweight", icon: <Sparkles className="size-4" /> },
  { id: "tools", name: "Agent (tools)", desc: "Calls tools and APIs", icon: <Wrench className="size-4" /> },
  { id: "web", name: "Web-grounded", desc: "Answers with live search", icon: <Globe className="size-4" /> },
];

export function ModelSelectorSection(): ReactElement {
  return (
    <div className={cn("flex justify-end")}>
      <ModelSelector models={MODELS} defaultModel={MODELS[1]} defaultThinking="instant" />
    </div>
  );
}
