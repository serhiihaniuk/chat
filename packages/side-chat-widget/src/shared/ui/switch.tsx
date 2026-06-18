/**
 * §8.1 — Switch (Toggle primitive).
 *
 * Thin wrapper over Base UI `Switch` (Root → Thumb). The only chrome lives in two
 * hook classes (`sc-switch-root`, `sc-switch-thumb`) because the thumb travel is a
 * `calc()` derived from inset + knob (§7.1), not hand-tuned. State is exposed by
 * Base UI as `[data-checked]` / `[data-unchecked]` / `[data-disabled]` and consumed
 * entirely in the CSS layer — JSX never writes `:checked`, and the thumb never sets
 * `translate`. Wrap in `Field.Label` for the accessible name (no `htmlFor`/`id`).
 */
import { type ReactElement } from "react";

import { Field } from "@base-ui/react/field";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "#shared/lib/cn";

export function Switch({
  className,
  ...props
}: SwitchPrimitive.Root.Props): ReactElement {
  return (
    <SwitchPrimitive.Root className={cn("sc-switch-root", className)} {...props}>
      <SwitchPrimitive.Thumb className="sc-switch-thumb" />
    </SwitchPrimitive.Root>
  );
}

const TITLE_CLASS = "text-sm font-semibold text-foreground";
const HINT_CLASS = "text-xs text-muted-foreground";

export function SwitchSection(): ReactElement {
  // Each labelled row is its own Field.Root — Base UI requires Field parts to live
  // inside a Field.Root, and the Root wires the Label→control association for us.
  const rows = [
    { title: "Send on Enter", hint: "Shift+Enter inserts a newline", control: <Switch defaultChecked /> },
    { title: "Stream responses", hint: "Render tokens as they arrive", control: <Switch /> },
    { title: "Web search", hint: "Unavailable on this model", control: <Switch disabled /> },
  ];
  return (
    <div className="flex w-full flex-col gap-4">
      {rows.map((r) => (
        <Field.Root key={r.title}>
          <Field.Label className="flex items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className={TITLE_CLASS}>{r.title}</span>
              <span className={HINT_CLASS}>{r.hint}</span>
            </span>
            {r.control}
          </Field.Label>
        </Field.Root>
      ))}
    </div>
  );
}
