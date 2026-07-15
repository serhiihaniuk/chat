/**
 * Render the composer's "+" menu.
 *
 * In the live widget, `tools` and `onToggleTool` control which backend tools
 * are enabled for the next turn. Without them, the component renders its
 * self-contained demo rows.
 *
 * Base UI owns menu state and keyboard behavior. The CSS file owns the popup
 * surface and state styles, so this component only composes menu parts and
 * supplies the tool data.
 */
import { useState, type ReactElement } from "react";

import { Menu } from "@base-ui/react/menu";
import { Check, FileText, Globe, Paperclip, Plus } from "lucide-react";

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

const CONTEXT_SCOPES = {
  PAGE: "page",
  SELECTION: "selection",
  WORKSPACE: "workspace",
} as const;

type Scope = (typeof CONTEXT_SCOPES)[keyof typeof CONTEXT_SCOPES];

const SAMPLE_TOOLS: readonly ToolMenuItem[] = [
  { name: "web-search", label: "Web search", enabled: true },
  { name: "code-tools", label: "Code tools", enabled: false },
];

const SCOPES: ReadonlyArray<{ value: Scope; label: string }> = [
  { value: CONTEXT_SCOPES.PAGE, label: "This page" },
  { value: CONTEXT_SCOPES.SELECTION, label: "Selection" },
  { value: CONTEXT_SCOPES.WORKSPACE, label: "Whole workspace" },
];

export function ToolsMenu({
  includeHostContext = false,
  onToggleHostContext,
  tools = SAMPLE_TOOLS,
  onToggleTool,
}: {
  readonly includeHostContext?: boolean | undefined;
  readonly onToggleHostContext?: (() => void) | undefined;
  readonly tools?: readonly ToolMenuItem[];
  readonly onToggleTool?: ((name: string) => void) | undefined;
} = {}): ReactElement {
  const container = usePortalContainer();
  // A handler means a live host owns at least one menu section. Without one this
  // is the design demo, which also shows attach-file and context-scope rows.
  const isLive = onToggleTool !== undefined || onToggleHostContext !== undefined;
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
            {isLive ? null : (
              <>
                <Menu.Item className={ITEM_CLASS}>
                  <Paperclip className="size-4 text-muted-foreground" />
                  Attach file
                </Menu.Item>
                <Menu.Separator className="my-1.5 h-px bg-border" />
              </>
            )}

            {hasHostContext ? (
              <HostContextGroup enabled={includeHostContext} onToggle={onToggleHostContext} />
            ) : null}
            {hasHostContext && tools.length > 0 ? (
              <Menu.Separator className="my-1.5 h-px bg-border" />
            ) : null}
            <ToolCatalogContent
              hasHostContext={hasHostContext}
              isLive={isLive}
              onToggleTool={onToggleTool}
              tools={tools}
            />

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

function ToolCatalogContent({
  hasHostContext,
  isLive,
  onToggleTool,
  tools,
}: {
  readonly hasHostContext: boolean;
  readonly isLive: boolean;
  readonly onToggleTool: ((name: string) => void) | undefined;
  readonly tools: readonly ToolMenuItem[];
}): ReactElement | null {
  if (tools.length > 0) {
    return <ToolsGroup tools={tools} isLive={isLive} onToggleTool={onToggleTool} />;
  }
  if (!isLive || hasHostContext) return null;
  return <div className="px-2.5 py-2 text-sm text-muted-foreground">No tools available</div>;
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
          <MenuToggleIndicator checked={isEnabled(tool)} />
        </Menu.CheckboxItem>
      ))}
    </Menu.Group>
  );
}

function ScopeGroup(): ReactElement {
  const [scope, setScope] = useState<Scope>(CONTEXT_SCOPES.PAGE);

  return (
    <Menu.Group>
      <Menu.GroupLabel className={LABEL_CLASS}>Context scope</Menu.GroupLabel>
      <Menu.RadioGroup
        value={scope}
        onValueChange={(value) => {
          if (isScope(value)) setScope(value);
        }}
      >
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

/**
 * Switch-shaped status for a menu item, deliberately not another control.
 *
 * The CheckboxItem owns the accessible state and all pointer/keyboard input.
 * Nesting Base UI Switch inside it makes the visible track intercept clicks
 * without changing the parent item, so these spans reuse only the switch's
 * token-driven presentation and let events reach the item.
 */
function MenuToggleIndicator({ checked }: { readonly checked: boolean }): ReactElement {
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

const isScope = (value: unknown): value is Scope =>
  typeof value === "string" && Object.values(CONTEXT_SCOPES).some((scope) => scope === value);
