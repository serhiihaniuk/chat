/**
 * §8.8 — Segmented (single-select Toggle Group).
 *
 * A radio-like row built on Base UI ToggleGroup + Toggle. `value` is held as a
 * one-item array; the track is the `sc-seg` hook class and each item flexes to an
 * equal share. The active item is expressed through `pressed:` (fill + shadow,
 * never colour alone, never `:hover`), so exactly one item reads as raised.
 */
import { useState, type ComponentType, type ReactElement } from "react";

import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import { Gauge, Sparkles, Zap } from "lucide-react";

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
            "flex flex-1 cursor-pointer items-center justify-center rounded-sm px-1.5 text-xs font-medium text-muted-foreground pressed:bg-background pressed:text-foreground pressed:shadow-card",
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

export function SegmentedSection(): ReactElement {
  const [level, setLevel] = useState("auto");

  const items: SegmentedItem[] = [
    { id: "off", label: "Off", Icon: Zap },
    { id: "auto", label: "Auto", Icon: Gauge },
    { id: "max", label: "Max", Icon: Sparkles },
  ];

  return (
    <div className="flex w-full max-w-measure-empty flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">Thinking</span>
      <Segmented items={items} value={level} onValueChange={setLevel} />
    </div>
  );
}
