/**
 * Switch (Toggle primitive).
 *
 * Thin wrapper over Base UI `Switch` (Root → Thumb). The only chrome lives in two
 * hook classes (`sc-switch-root`, `sc-switch-thumb`) because the thumb travel is a
 * `calc()` derived from inset + knob (control sizing), not hand-tuned. State is exposed by
 * Base UI as `[data-checked]` / `[data-unchecked]` / `[data-disabled]` and consumed
 * entirely in the CSS layer — JSX never writes `:checked`, and the thumb never sets
 * `translate`. Wrap in `Field.Label` for the accessible name (no `htmlFor`/`id`).
 */
import { type ReactElement } from "react";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "#shared/lib/cn";

export function Switch({ className, ...props }: SwitchPrimitive.Root.Props): ReactElement {
  return (
    <SwitchPrimitive.Root className={cn("sc-switch-root", className)} {...props}>
      <SwitchPrimitive.Thumb className="sc-switch-thumb" />
    </SwitchPrimitive.Root>
  );
}
