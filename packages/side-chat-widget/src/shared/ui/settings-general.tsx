import type { ReactElement } from "react";

import { Field } from "@base-ui/react/field";

import { cn } from "#shared/lib/cn";
import { Segmented, type SegmentedItem } from "#shared/ui/segmented";
import { Switch } from "#shared/ui/switch";

const SETTINGS_HINT_CLASS = "text-xs text-(--settings-hint-fg)";

// Levels mirror entities/settings TOOL_DETAIL_LEVELS ("hidden" | "name" | "full").
const TOOL_DETAIL_ITEMS: readonly SegmentedItem[] = [
  { id: "hidden", label: "Hidden" },
  { id: "name", label: "Name only" },
  { id: "full", label: "Full" },
];

export function GeneralGroup({
  narrow,
  onSendWithCtrlEnterChange,
  onToolDetailChange,
  sendWithCtrlEnter,
  toolDetail,
}: {
  readonly narrow: boolean;
  readonly onSendWithCtrlEnterChange: (value: boolean) => void;
  readonly onToolDetailChange: (value: string) => void;
  readonly sendWithCtrlEnter: boolean;
  readonly toolDetail: string;
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
      <Field.Root>
        <span className="flex min-w-0 flex-col gap-px">
          <span className="text-(length:--settings-label-size) font-medium text-(--settings-label-fg)">
            Tool call details
          </span>
          <span className={SETTINGS_HINT_CLASS}>
            {narrow
              ? "How much of each tool call is shown"
              : "How much of each tool call the activity timeline shows"}
          </span>
        </span>
        <Segmented
          className="mt-2"
          items={[...TOOL_DETAIL_ITEMS]}
          onValueChange={onToolDetailChange}
          value={toolDetail}
        />
      </Field.Root>
    </div>
  );
}
