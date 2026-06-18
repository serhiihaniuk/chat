/**
 * §9.3 — Tools menu.
 *
 * A composition only: every row is an existing primitive. Built on Base UI `Menu`
 * with `data-slot="dropdown-menu-content"` on the popup (so the surface — border,
 * `bg-popover`, `shadow-popover`, enter/exit transition — is owned by styles.css),
 * plus the `Switch` primitive (§8.1) for tool toggles and `Menu.Separator` between
 * regions. No new surface tokens: the popup reuses `--menu-*`, the switch `--switch-*`.
 *
 * The trigger is the composer `+` button (`sc-composer-add`); its `+`→`×` rotation
 * is owned by that utility on the popup-open state. State is read via named Base UI
 * variants only — items expose `highlighted:`, the tool toggles `checked:`, and the
 * scope rows render a `RadioItemIndicator` check. One popover open at a time (Base UI).
 */
import { useState, type ReactElement } from "react";

import { Menu } from "@base-ui/react/menu";
import { Check, FileText, Globe, Paperclip, Plus, Wrench } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { Switch } from "#shared/ui/switch";
import { usePortalContainer } from "#shared/ui/widget-root";

const ITEM_CLASS =
  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm highlighted:bg-accent";
const LABEL_CLASS =
  "px-2.5 pt-1.5 pb-1 text-2xs font-bold uppercase tracking-wider text-muted-foreground";

type ToolKey = "web-search" | "code-tools";
type Scope = "page" | "selection" | "workspace";

const TOOLS: ReadonlyArray<{ key: ToolKey; label: string; icon: ReactElement }> = [
  { key: "web-search", label: "Web search", icon: <Globe className="size-4 text-muted-foreground" /> },
  { key: "code-tools", label: "Code tools", icon: <Wrench className="size-4 text-muted-foreground" /> },
];

const SCOPES: ReadonlyArray<{ value: Scope; label: string }> = [
  { value: "page", label: "This page" },
  { value: "selection", label: "Selection" },
  { value: "workspace", label: "Whole workspace" },
];

export function ToolsMenu(): ReactElement {
  const container = usePortalContainer();
  const [tools, setTools] = useState<Record<ToolKey, boolean>>({
    "web-search": true,
    "code-tools": false,
  });
  const [scope, setScope] = useState<Scope>("page");

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Add context and tools"
        className="sc-composer-add rounded-full border border-border"
      >
        <Plus className="size-4" />
      </Menu.Trigger>

      <Menu.Portal container={container}>
        <Menu.Positioner side="top" align="start" sideOffset={8}>
          <Menu.Popup data-slot="dropdown-menu-content" className="w-menu">
            <Menu.Item className={ITEM_CLASS}>
              <Paperclip className="size-4 text-muted-foreground" />
              Attach file
            </Menu.Item>

            <Menu.Separator className="my-1.5 h-px bg-border" />

            <Menu.Group>
              <Menu.GroupLabel className={LABEL_CLASS}>Tools</Menu.GroupLabel>
              {TOOLS.map(({ key, label, icon }) => (
                <Menu.CheckboxItem
                  key={key}
                  checked={tools[key]}
                  onCheckedChange={(checked) =>
                    setTools((prev) => ({ ...prev, [key]: checked }))
                  }
                  closeOnClick={false}
                  className={ITEM_CLASS}
                >
                  {icon}
                  <span className="flex-1">{label}</span>
                  {/* Switch is presentational here — the CheckboxItem owns focus/keyboard */}
                  <Switch checked={tools[key]} tabIndex={-1} />
                </Menu.CheckboxItem>
              ))}
            </Menu.Group>

            <Menu.Separator className="my-1.5 h-px bg-border" />

            <Menu.Group>
              <Menu.GroupLabel className={LABEL_CLASS}>Context scope</Menu.GroupLabel>
              <Menu.RadioGroup
                value={scope}
                onValueChange={(value) => setScope(value as Scope)}
              >
                {SCOPES.map(({ value, label }) => (
                  <Menu.RadioItem
                    key={value}
                    value={value}
                    closeOnClick={false}
                    className={ITEM_CLASS}
                  >
                    <FileText className="size-4 text-muted-foreground" />
                    <span className="flex-1">{label}</span>
                    <Menu.RadioItemIndicator className="flex items-center text-primary">
                      <Check className="size-4" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function ToolsMenuSection(): ReactElement {
  return (
    <div className="flex flex-col items-start gap-3 p-4">
      <ToolsMenu />
      <p className={cn("text-xs text-muted-foreground")}>
        Click the <span className="font-semibold text-foreground">+</span> to open the
        tools menu — toggle a tool or pick a context scope.
      </p>
    </div>
  );
}
