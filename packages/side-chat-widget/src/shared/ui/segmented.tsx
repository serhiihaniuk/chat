/**
 * Segmented control — single-select Toggle Group.
 *
 * A radio-like row built on Base UI ToggleGroup + Toggle. `value` is held as a
 * one-item array; the track is the `sc-seg` hook class and each item flexes to an
 * equal share. The active item is expressed through `pressed:` (fill + shadow,
 * never colour alone, never `:hover`), so exactly one item reads as raised.
 */
import { type ComponentType, type ReactElement } from "react";

import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";

import { cn } from "#shared/lib/cn";

export type SegmentedItem = {
  id: string;
  label: string;
  Icon?: ComponentType<{ className?: string }>;
};

export function Segmented({
  items,
  value,
  onValueChange,
  className,
  stacked = false,
}: {
  items: readonly SegmentedItem[];
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
  /** Stack the icon above the label (taller items) — used by the thinking control. */
  stacked?: boolean;
}): ReactElement {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(v) => v[0] && onValueChange(v[0])}
      className={cn("sc-seg", className)}
    >
      {items.map(({ id, label, Icon }) => (
        <Toggle
          key={id}
          value={id}
          aria-label={label}
          className={cn(
            "flex flex-1 cursor-pointer items-center justify-center rounded-sm px-1.5 text-xs font-medium text-muted-foreground pressed:bg-background pressed:text-foreground pressed:shadow-(--shadow-card)",
            stacked ? "flex-col gap-1 py-2" : "gap-1.5 py-1.5",
          )}
        >
          {Icon ? <Icon className="size-4" /> : null}
          {label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
