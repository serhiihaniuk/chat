/**
 * Select: the non-searchable dropdown.
 *
 * This uses Base UI `Select` for model and settings choices. If the control needs
 * a search field, use the Combobox pattern instead (Combobox).
 *
 * Keep this part tree intact:
 * `Select.Root` → `Select.Trigger` → `Select.Portal(container)` → `Select.Positioner`
 * → `Select.Popup[data-slot="select-content"]` → `Select.List` → `Select.Item`.
 * The popup CSS uses the shared `select-content` slot, and the portal stays inside
 * the widget root so the theme and font apply. Base UI handles typeahead;
 * `highlighted:` marks the active item and `selected:` shows the check.
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
                    className="flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 highlighted:bg-accent"
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
