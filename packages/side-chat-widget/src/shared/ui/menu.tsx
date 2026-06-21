/**
 * §8.2 — Menu / Popover.
 *
 * Built directly on Base UI Menu. Consumers compose the parts themselves; the
 * only shared affordance is `MenuSection` (the showcase demo) — siblings import
 * `Menu` from "@base-ui/react/menu" and tag their `Menu.Popup` with
 * `data-slot="dropdown-menu-content"` to inherit the portaled-popup contract.
 *
 * The popup's surface (border, bg-popover, shadow-(--shadow-popover), transform-origin,
 * enter/exit scale+fade) is owned entirely by styles.css via that data-slot, so
 * JSX never re-declares colour/shadow on the popup — it only sets the slot.
 */
import { useState, type ReactElement } from "react";

import { Menu } from "@base-ui/react/menu";
import { Check, Globe, Paperclip, Wrench } from "lucide-react";

import { usePortalContainer } from "#shared/ui/widget-root";

export function MenuSection(): ReactElement {
  const container = usePortalContainer();
  const [webSearch, setWebSearch] = useState(true);
  const [codeTools, setCodeTools] = useState(false);

  return (
    <div className="flex items-start gap-4 p-4">
      <Menu.Root>
        <Menu.Trigger className="sc-icon-btn" aria-label="Open menu">
          <Wrench className="size-4" />
        </Menu.Trigger>

        <Menu.Portal container={container}>
          <Menu.Positioner side="bottom" align="start" sideOffset={6}>
            <Menu.Popup data-slot="dropdown-menu-content" className="w-menu">
              <Menu.Item className="flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm highlighted:bg-accent">
                <Paperclip className="size-4 text-muted-foreground" />
                Attach file
              </Menu.Item>

              <Menu.Separator className="my-1.5 h-px bg-border" />

              <Menu.Group>
                <Menu.GroupLabel className="px-2.5 pt-1.5 pb-1 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  Tools
                </Menu.GroupLabel>

                <Menu.CheckboxItem
                  checked={webSearch}
                  onCheckedChange={setWebSearch}
                  closeOnClick={false}
                  className="flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm highlighted:bg-accent"
                >
                  <Globe className="size-4 text-muted-foreground" />
                  <span className="flex-1">Web search</span>
                  <Menu.CheckboxItemIndicator className="flex items-center text-primary">
                    <Check className="size-4" />
                  </Menu.CheckboxItemIndicator>
                </Menu.CheckboxItem>

                <Menu.CheckboxItem
                  checked={codeTools}
                  onCheckedChange={setCodeTools}
                  closeOnClick={false}
                  className="flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm highlighted:bg-accent"
                >
                  <Wrench className="size-4 text-muted-foreground" />
                  <span className="flex-1">Code tools</span>
                  <Menu.CheckboxItemIndicator className="flex items-center text-primary">
                    <Check className="size-4" />
                  </Menu.CheckboxItemIndicator>
                </Menu.CheckboxItem>
              </Menu.Group>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
