/**
 * §8.10 — Select (non-searchable dropdown).
 *
 * Built from Base UI `Select`. This is the Default-model field in Settings: a plain
 * value picker with NO search field (a search field would make it a Combobox, §8.11).
 *
 * Part tree (contract): Select.Root (items/value/onValueChange) → Select.Trigger
 * (Select.Value + Select.Icon) → Select.Portal(container) → Select.Positioner →
 * Select.Popup[data-slot="select-content"] → Select.List → Select.Item
 * (Select.ItemText + Select.ItemIndicator). The popup is styled in CSS via the
 * shared `select-content` slot; the portal mounts into the widget root (G5) so it
 * keeps the theme + font. Item state is `highlighted:` (active) and `selected:`
 * (chosen → check). Typeahead is built into Base UI.
 */
import { useState, type ReactElement } from "react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

import { usePortalContainer } from "#shared/ui/widget-root";

type SelectModel = { id: string; name: string };

const DEFAULT_MODEL: SelectModel = { id: "claude-opus", name: "Claude Opus 4.8" };

const MODELS: readonly SelectModel[] = [
  DEFAULT_MODEL,
  { id: "claude-sonnet", name: "Claude Sonnet 4.5" },
  { id: "claude-haiku", name: "Claude Haiku 4" },
  { id: "gpt-5", name: "GPT-5" },
];

export function SelectSection(): ReactElement {
  const container = usePortalContainer();
  const [model, setModel] = useState<SelectModel>(DEFAULT_MODEL);

  return (
    <div className="flex flex-col gap-3 max-w-measure-empty">
      <span className="text-xs text-muted-foreground">Default model</span>

      <Select.Root
        items={MODELS.map((m) => ({ label: m.name, value: m }))}
        value={model}
        onValueChange={(value) => value && setModel(value)}
        itemToStringLabel={(m: SelectModel) => m.name}
        isItemEqualToValue={(a: SelectModel, b: SelectModel) => a?.id === b?.id}
      >
        <Select.Trigger className="sc-icon-btn w-full justify-between px-3 rounded-xl border border-input">
          <Select.Value />
          <Select.Icon>
            <ChevronDown className="size-4 text-muted-foreground" />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal container={container}>
          <Select.Positioner sideOffset={6}>
            <Select.Popup data-slot="select-content">
              <Select.List>
                {MODELS.map((m) => (
                  <Select.Item
                    key={m.id}
                    value={m}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-md highlighted:bg-accent"
                  >
                    <Select.ItemText>{m.name}</Select.ItemText>
                    <Select.ItemIndicator className="ml-auto opacity-0 selected:opacity-100 text-primary">
                      <Check className="size-4" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>

      <span className="text-2xs text-muted-foreground">Selected: {model.name}</span>
    </div>
  );
}
