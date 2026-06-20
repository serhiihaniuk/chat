import type { ReactElement } from "react";

import { Field } from "@base-ui/react/field";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { Switch } from "#shared/ui/switch";
import { usePortalContainer } from "#shared/ui/widget-root";

export type ModelOption = {
  readonly id: string;
  readonly name: string;
};

export const DEFAULT_MODEL: ModelOption = { id: "default", name: "Default model" };

const MODELS: readonly ModelOption[] = [
  DEFAULT_MODEL,
  { id: "code", name: "Code helper" },
  { id: "research", name: "Researcher" },
];

const SETTINGS_LABEL_CLASS =
  "text-(length:--settings-label-size) font-semibold text-(--settings-label-fg)";

const SETTINGS_HINT_CLASS = "text-xs text-(--settings-hint-fg)";

export function GeneralGroup({
  instructions,
  model,
  narrow,
  onInstructionsChange,
  onModelChange,
  onSendOnEnterChange,
  sendOnEnter,
}: {
  readonly instructions: string;
  readonly model: ModelOption;
  readonly narrow: boolean;
  readonly onInstructionsChange: (value: string) => void;
  readonly onModelChange: (value: ModelOption) => void;
  readonly onSendOnEnterChange: (value: boolean) => void;
  readonly sendOnEnter: boolean;
}): ReactElement {
  const container = usePortalContainer();

  return (
    <div className={cn("flex flex-col", narrow ? "gap-4" : "gap-4.5")}>
      <Field.Root>
        <Field.Label className={SETTINGS_LABEL_CLASS}>Custom instructions</Field.Label>
        <Field.Description className={cn(SETTINGS_HINT_CLASS, "mt-1 leading-normal")}>
          Prepended to every conversation as the system prompt.
        </Field.Description>
        <Field.Control
          value={instructions}
          onValueChange={onInstructionsChange}
          placeholder="You are a concise assistant for our workspace..."
          render={<textarea rows={4} data-narrow={narrow ? "true" : undefined} />}
          className="sc-settings-textarea"
        />
      </Field.Root>

      <Field.Root>
        <Field.Label className="sc-settings-switch-row">
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="text-(length:--settings-label-size) font-medium text-(--settings-label-fg)">
              Send on Enter
            </span>
            <span className={SETTINGS_HINT_CLASS}>
              {narrow ? "Shift+Enter -> newline" : "Shift+Enter inserts a newline"}
            </span>
          </span>
          <Switch checked={sendOnEnter} onCheckedChange={onSendOnEnterChange} />
        </Field.Label>
      </Field.Root>

      <div>
        <div className={cn(SETTINGS_LABEL_CLASS, "mb-2")}>Default model</div>
        <Select.Root
          items={MODELS.map((modelOption) => ({ label: modelOption.name, value: modelOption }))}
          value={model}
          onValueChange={(value) => value && onModelChange(value)}
          itemToStringLabel={(modelOption: ModelOption) => modelOption.name}
          isItemEqualToValue={(left: ModelOption, right: ModelOption) => left?.id === right?.id}
        >
          <Select.Trigger className="sc-settings-select-trigger justify-between">
            <Select.Value className="text-sm text-foreground" />
            <Select.Icon className="inline-flex text-muted-foreground">
              <ChevronDown className="size-3.5" />
            </Select.Icon>
          </Select.Trigger>

          <Select.Portal container={container}>
            <Select.Positioner sideOffset={6}>
              <Select.Popup data-slot="select-content">
                <Select.List>
                  {MODELS.map((modelOption) => (
                    <Select.Item
                      key={modelOption.id}
                      value={modelOption}
                      className="sc-settings-menu-row"
                    >
                      <Select.ItemText className="flex-1 text-sm text-foreground">
                        {modelOption.name}
                      </Select.ItemText>
                      <Select.ItemIndicator className="inline-flex shrink-0 text-primary">
                        <Check className="size-3.5" strokeWidth={2.4} />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.List>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </div>
    </div>
  );
}
