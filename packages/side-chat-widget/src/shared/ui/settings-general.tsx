import type { ReactElement } from "react";

import { Field } from "@base-ui/react/field";

import { cn } from "#shared/lib/cn";
import { Switch } from "#shared/ui/switch";

const SETTINGS_HINT_CLASS = "text-xs text-(--settings-hint-fg)";

export function GeneralGroup({
  narrow,
  onSendWithCtrlEnterChange,
  sendWithCtrlEnter,
}: {
  readonly narrow: boolean;
  readonly onSendWithCtrlEnterChange: (value: boolean) => void;
  readonly sendWithCtrlEnter: boolean;
}): ReactElement {
  return (
    <div className={cn("flex flex-col", narrow ? "gap-4" : "gap-4.5")}>
      <Field.Root>
        <Field.Label className="sc-settings-switch-row">
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="text-(length:--settings-label-size) font-medium text-(--settings-label-fg)">
              Send with Ctrl+Enter
            </span>
            <span className={SETTINGS_HINT_CLASS}>
              {narrow ? "Enter adds a newline" : "Use Ctrl+Enter to send; Enter adds a newline"}
            </span>
          </span>
          <Switch checked={sendWithCtrlEnter} onCheckedChange={onSendWithCtrlEnterChange} />
        </Field.Label>
      </Field.Root>
    </div>
  );
}
