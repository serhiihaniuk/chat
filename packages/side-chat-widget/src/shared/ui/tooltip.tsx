/**
 * Tooltip.
 *
 * Built from Base UI `Tooltip`. Replaces the native `title` attribute on header
 * icon buttons (Settings / New chat / Close). No dedicated palette — the popup
 * inherits the menu colours via the `tooltip-content` slot (--popover-*).
 *
 * One `Tooltip.Provider` near the root sets a shared open delay; every icon
 * button that lacks a visible label needs a tooltip + `aria-label`.
 */
import { Tooltip } from "@base-ui/react/tooltip";
import { Plus, Settings, X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { usePortalContainer } from "#shared/ui/widget-root";

const TOOLTIP_POPUP_CLASS =
  "rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground border border-border shadow-(--shadow-popover) starting:opacity-0 ending:opacity-0";

/** A single labelled icon-button + its tooltip. Trigger is a plain `sc-icon-btn`. */
function TooltipIconButton({
  label,
  container,
  children,
}: {
  label: string;
  container: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <button type="button" className="sc-icon-btn" aria-label={label}>
            {children}
          </button>
        }
      />
      <Tooltip.Portal container={container}>
        <Tooltip.Positioner sideOffset={6}>
          <Tooltip.Popup data-slot="tooltip-content" className={TOOLTIP_POPUP_CLASS}>
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function TooltipSection(): ReactElement {
  const container = usePortalContainer();

  return (
    <Tooltip.Provider delay={500}>
      <div className="flex items-center gap-1">
        <TooltipIconButton label="Settings" container={container}>
          <Settings className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton label="New chat" container={container}>
          <Plus className="size-4" />
        </TooltipIconButton>
        <TooltipIconButton label="Close" container={container}>
          <X className="size-4" />
        </TooltipIconButton>
      </div>
    </Tooltip.Provider>
  );
}
