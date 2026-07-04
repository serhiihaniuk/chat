/**
 * §9.3 — Tools menu.
 *
 * The composer "+" menu. In the live widget it lists the backend tool catalog
 * (`tools` with an `onToggleTool` handler) so each tool can be enabled or
 * disabled for the next turn. With no handler it is the self-contained design
 * demo: sample tools plus the attach-file and context-scope rows that show the
 * full menu surface for the showcase and docs.
 *
 * Built on Base UI `Menu` with `data-slot="dropdown-menu-content"` on the popup
 * (so the surface — border, `bg-popover`, `shadow-(--shadow-popover)`, enter/exit
 * transition — is owned by styles.css), plus the `Switch` primitive (§8.1) for
 * tool toggles and `Menu.Separator` between regions. No new surface tokens: the
 * popup reuses `--menu-*`, the switch `--switch-*`.
 *
 * The trigger is the composer `+` button (`sc-composer-add`); its `+`→`×` rotation
 * is owned by that utility on the popup-open state. State is read via named Base UI
 * variants only — items expose `highlighted:`, the tool toggles `checked:`, and the
 * scope rows render a `RadioItemIndicator` check. One popover open at a time (Base UI).
 */
import { useState, type ReactElement } from "react";

import { Menu } from "@base-ui/react/menu";
import { Check, FileText, Globe, Paperclip, Plus } from "lucide-react";

import { Switch } from "#shared/ui/switch";
import { usePortalContainer } from "#shared/ui/widget-root";

const ITEM_CLASS =
  "flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm highlighted:bg-accent";
const LABEL_CLASS =
  "px-2.5 pt-1.5 pb-1 text-2xs font-bold uppercase tracking-wider text-muted-foreground";

/** One row in the tools menu: a backend tool the model may call this turn. */
export type ToolMenuItem = {
  readonly name: string;
  readonly label: string;
  readonly description?: string | undefined;
  readonly enabled: boolean;
};

type Scope = "page" | "selection" | "workspace";

const SAMPLE_TOOLS: readonly ToolMenuItem[] = [
  { name: "web-search", label: "Web search", enabled: true },
  { name: "code-tools", label: "Code tools", enabled: false },
];

const SCOPES: ReadonlyArray<{ value: Scope; label: string }> = [
  { value: "page", label: "This page" },
  { value: "selection", label: "Selection" },
  { value: "workspace", label: "Whole workspace" },
];

export function ToolsMenu({
  tools = SAMPLE_TOOLS,
  onToggleTool,
}: {
  readonly tools?: readonly ToolMenuItem[];
  readonly onToggleTool?: ((name: string) => void) | undefined;
} = {}): ReactElement {
  const container = usePortalContainer();
  // A handler means a live host owns the catalog; without one this is the design
  // demo, which also shows the attach-file and context-scope surface.
  const isLive = onToggleTool !== undefined;

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
            {isLive ? null : (
              <>
                <Menu.Item className={ITEM_CLASS}>
                  <Paperclip className="size-4 text-muted-foreground" />
                  Attach file
                </Menu.Item>
                <Menu.Separator className="my-1.5 h-px bg-border" />
              </>
            )}

            <ToolsGroup tools={tools} isLive={isLive} onToggleTool={onToggleTool} />

            {isLive ? null : (
              <>
                <Menu.Separator className="my-1.5 h-px bg-border" />
                <ScopeGroup />
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function ToolsGroup({
  tools,
  isLive,
  onToggleTool,
}: {
  readonly tools: readonly ToolMenuItem[];
  readonly isLive: boolean;
  readonly onToggleTool: ((name: string) => void) | undefined;
}): ReactElement {
  // Local state drives the prop-less demo; a live host owns `enabled` and the
  // toggle flows back through `onToggleTool`.
  const [localEnabled, setLocalEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(tools.map((tool) => [tool.name, tool.enabled])),
  );

  if (tools.length === 0) {
    return <div className="px-2.5 py-2 text-sm text-muted-foreground">No tools available</div>;
  }

  const isEnabled = (tool: ToolMenuItem): boolean =>
    onToggleTool ? tool.enabled : (localEnabled[tool.name] ?? tool.enabled);
  const toggle = (tool: ToolMenuItem): void => {
    if (onToggleTool) {
      onToggleTool(tool.name);
      return;
    }
    setLocalEnabled((prev) => ({ ...prev, [tool.name]: !(prev[tool.name] ?? tool.enabled) }));
  };

  return (
    <Menu.Group>
      <Menu.GroupLabel className={LABEL_CLASS}>
        {isLive ? "Available tools" : "Tools"}
      </Menu.GroupLabel>
      {tools.map((tool) => (
        <Menu.CheckboxItem
          key={tool.name}
          checked={isEnabled(tool)}
          onCheckedChange={() => toggle(tool)}
          closeOnClick={false}
          className={ITEM_CLASS}
        >
          <Globe className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{tool.label}</span>
            {tool.description ? (
              <span className="truncate text-2xs text-muted-foreground">{tool.description}</span>
            ) : null}
          </span>
          {/* Switch is presentational here — the CheckboxItem owns focus/keyboard */}
          <Switch checked={isEnabled(tool)} tabIndex={-1} />
        </Menu.CheckboxItem>
      ))}
    </Menu.Group>
  );
}

function ScopeGroup(): ReactElement {
  const [scope, setScope] = useState<Scope>("page");

  return (
    <Menu.Group>
      <Menu.GroupLabel className={LABEL_CLASS}>Context scope</Menu.GroupLabel>
      <Menu.RadioGroup value={scope} onValueChange={(value) => setScope(value as Scope)}>
        {SCOPES.map(({ value, label }) => (
          <Menu.RadioItem key={value} value={value} closeOnClick={false} className={ITEM_CLASS}>
            <FileText className="size-4 text-muted-foreground" />
            <span className="flex-1">{label}</span>
            <Menu.RadioItemIndicator className="flex items-center text-primary">
              <Check className="size-4" />
            </Menu.RadioItemIndicator>
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </Menu.Group>
  );
}
