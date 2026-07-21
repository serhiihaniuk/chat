/**
 * Render the composer's "+" menu.
 *
 * `tools` and `onToggleTool` control which backend tools are enabled for the
 * next turn. The owning feature supplies all state and behavior.
 *
 * Base UI owns menu state and keyboard behavior. The CSS file owns the popup
 * surface and state styles, so this component only composes menu parts and
 * supplies the tool data.
 */
import type { ReactElement } from "react";

import { Menu } from "@base-ui/react/menu";
import { FileText, Globe, Plus } from "lucide-react";

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

export type ToolsMenuProps = {
  readonly includeHostContext?: boolean | undefined;
  readonly onToggleHostContext?: (() => void) | undefined;
  readonly onToggleTool: (name: string) => void;
  readonly tools: readonly ToolMenuItem[];
};

export function ToolsMenu({
  includeHostContext = false,
  onToggleHostContext,
  onToggleTool,
  tools,
}: ToolsMenuProps): ReactElement {
  const container = usePortalContainer();
  const hasHostContext = onToggleHostContext !== undefined;

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
            {hasHostContext ? (
              <HostContextGroup
                enabled={includeHostContext}
                onToggle={onToggleHostContext}
              />
            ) : null}
            {hasHostContext && tools.length > 0 ? (
              <Menu.Separator className="my-1.5 h-px bg-border" />
            ) : null}
            <ToolCatalogContent
              hasHostContext={hasHostContext}
              onToggleTool={onToggleTool}
              tools={tools}
            />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function ToolCatalogContent({
  hasHostContext,
  onToggleTool,
  tools,
}: {
  readonly hasHostContext: boolean;
  readonly onToggleTool: (name: string) => void;
  readonly tools: readonly ToolMenuItem[];
}): ReactElement | null {
  if (tools.length > 0) {
    return <ToolsGroup tools={tools} onToggleTool={onToggleTool} />;
  }
  if (hasHostContext) return null;
  return (
    <div className="px-2.5 py-2 text-sm text-muted-foreground">
      No tools available
    </div>
  );
}

function HostContextGroup({
  enabled,
  onToggle,
}: {
  readonly enabled: boolean;
  readonly onToggle: () => void;
}): ReactElement {
  return (
    <Menu.Group>
      <Menu.GroupLabel className={LABEL_CLASS}>Context</Menu.GroupLabel>
      <Menu.CheckboxItem
        checked={enabled}
        onCheckedChange={onToggle}
        closeOnClick={false}
        className={ITEM_CLASS}
      >
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1">Include page context</span>
        <MenuToggleIndicator checked={enabled} />
      </Menu.CheckboxItem>
    </Menu.Group>
  );
}

function ToolsGroup({
  tools,
  onToggleTool,
}: {
  readonly tools: readonly ToolMenuItem[];
  readonly onToggleTool: (name: string) => void;
}): ReactElement {
  return (
    <Menu.Group>
      <Menu.GroupLabel className={LABEL_CLASS}>Available tools</Menu.GroupLabel>
      {tools.map((tool) => (
        <Menu.CheckboxItem
          key={tool.name}
          checked={tool.enabled}
          onCheckedChange={() => onToggleTool(tool.name)}
          closeOnClick={false}
          className={ITEM_CLASS}
        >
          <Globe className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{tool.label}</span>
            {tool.description ? (
              <span className="truncate text-2xs text-muted-foreground">
                {tool.description}
              </span>
            ) : null}
          </span>
          <MenuToggleIndicator checked={tool.enabled} />
        </Menu.CheckboxItem>
      ))}
    </Menu.Group>
  );
}

/**
 * Switch-shaped status for a menu item, deliberately not another control.
 *
 * The CheckboxItem owns the accessible state and all pointer/keyboard input.
 * Nesting Base UI Switch inside it makes the visible track intercept clicks
 * without changing the parent item, so these spans reuse only the switch's
 * token-driven presentation and let events reach the item.
 */
function MenuToggleIndicator({
  checked,
}: {
  readonly checked: boolean;
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="sc-switch-root"
      data-checked={checked ? "" : undefined}
      data-unchecked={checked ? undefined : ""}
    >
      <span className="sc-switch-thumb" />
    </span>
  );
}
