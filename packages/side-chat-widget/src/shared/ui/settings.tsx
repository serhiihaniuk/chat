/**
 * Settings (responsive).
 *
 * One group state drives both navigators and the same Tabs.Panel set. Wide uses a
 * left rail; narrow keeps Tabs.Root mounted but swaps the navigator to a top
 * Select. Theme rows, accent swatches, field shells, and panel spacing follow the
 * design_widget.html Settings source before any live measurement.
 */
import { useState, type ReactElement } from "react";

import { Select } from "@base-ui/react/select";
import { Tabs } from "@base-ui/react/tabs";
import { Check, ChevronDown, Menu, X } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { ScrollArea } from "#shared/ui/scroll-area";
import {
  createSettingsGroups,
  DEFAULT_MODEL,
  type AccentOption,
  type ModelOption,
  type SettingsGroup,
  type ThemePreview,
} from "#shared/ui/settings-groups";
import { usePortalContainer } from "#shared/ui/widget-root";

const TAB_CLASS =
  "flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent text-left text-sm font-medium text-(--settings-item-fg) selected:bg-(--settings-item-active-bg) px-(--settings-item-px) py-(--settings-item-py) rounded-(--settings-item-radius)";

export function SettingsPanel({ wide = true }: { wide?: boolean }): ReactElement {
  const [group, setGroup] = useState("theme");
  const [theme, setTheme] = useState<ThemePreview>("graphite");
  const [accent, setAccent] = useState<AccentOption["id"]>("default");
  const [corners, setCorners] = useState("default");
  const [density, setDensity] = useState("cozy");
  const [instructions, setInstructions] = useState("");
  const [sendOnEnter, setSendOnEnter] = useState(true);
  const [model, setModel] = useState<ModelOption>(DEFAULT_MODEL);

  const groups = createSettingsGroups({
    accent,
    corners,
    density,
    instructions,
    model,
    onAccentChange: setAccent,
    onCornersChange: setCorners,
    onDensityChange: setDensity,
    onInstructionsChange: setInstructions,
    onModelChange: setModel,
    onSendOnEnterChange: setSendOnEnter,
    onThemeChange: setTheme,
    sendOnEnter,
    theme,
  });
  const active = findActiveGroup(groups, group);
  const selectGroup = (next: string | number | null): void => {
    if (typeof next === "string") setGroup(next);
  };

  return (
    <Tabs.Root
      value={group}
      onValueChange={selectGroup}
      className={cn("min-h-0 flex-1 overflow-hidden", wide ? "flex" : "flex flex-col p-3")}
    >
      {wide ? (
        <WideSettingsNav groups={groups} />
      ) : (
        <NarrowSettingsSelect active={active} groups={groups} onGroupChange={setGroup} />
      )}
      <SettingsPanels groups={groups} wide={wide} />
    </Tabs.Root>
  );
}

const findActiveGroup = (groups: readonly SettingsGroup[], groupId: string): SettingsGroup =>
  groups.find((candidate) => candidate.id === groupId) ?? groups[0]!;

const WideSettingsNav = ({
  groups,
}: {
  readonly groups: readonly SettingsGroup[];
}): ReactElement => (
  <Tabs.List className="flex w-(--settings-nav-w) shrink-0 flex-col gap-0.5 border-r border-(--settings-nav-border) bg-(--settings-nav-bg) px-2 py-2.5">
    {groups.map((group) => (
      <Tabs.Tab key={group.id} value={group.id} className={TAB_CLASS}>
        <group.Icon className="shrink-0 text-muted-foreground" size={15} strokeWidth={1.8} />
        <span className="truncate">{group.label}</span>
      </Tabs.Tab>
    ))}
  </Tabs.List>
);

const NarrowSettingsSelect = ({
  active,
  groups,
  onGroupChange,
}: {
  readonly active: SettingsGroup;
  readonly groups: readonly SettingsGroup[];
  readonly onGroupChange: (groupId: string) => void;
}): ReactElement => {
  const container = usePortalContainer();
  const selectGroup = (next: SettingsGroup | null): void => {
    if (next) onGroupChange(next.id);
  };

  return (
    <Select.Root
      items={groups.map((group) => ({ label: group.label, value: group }))}
      value={active}
      onValueChange={selectGroup}
      itemToStringLabel={(group: SettingsGroup) => group.label}
      isItemEqualToValue={(left: SettingsGroup, right: SettingsGroup) => left?.id === right?.id}
    >
      <Select.Trigger className="sc-settings-select-trigger flex-none">
        <Menu className="shrink-0 text-muted-foreground" size={15} strokeWidth={1.8} />
        <Select.Value className="flex-1 text-left text-sm font-medium text-foreground" />
        <Select.Icon className="inline-flex text-muted-foreground">
          <ChevronDown className="size-3.5" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal container={container}>
        <Select.Positioner sideOffset={5}>
          <Select.Popup data-slot="select-content">
            <Select.List>
              {groups.map((group) => (
                <Select.Item key={group.id} value={group} className="sc-settings-menu-row">
                  <group.Icon className="shrink-0 text-(--media-fg)" size={15} strokeWidth={1.8} />
                  <Select.ItemText className="min-w-0 flex-1 text-sm text-foreground">
                    {group.label}
                  </Select.ItemText>
                  <Select.ItemIndicator className="inline-flex shrink-0 text-primary">
                    <Check className="size-3.5" strokeWidth={2.4} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
};

const SettingsPanels = ({
  groups,
  wide,
}: {
  readonly groups: readonly SettingsGroup[];
  readonly wide: boolean;
}): ReactElement => (
  <>
    {groups.map((group) => (
      <Tabs.Panel
        key={group.id}
        value={group.id}
        className={cn("min-w-0 flex-1", wide ? "relative" : "relative mt-3")}
      >
        <ScrollArea className={cn("absolute inset-0", wide ? "p-(--settings-content-pad)" : "")}>
          {group.render(!wide)}
        </ScrollArea>
      </Tabs.Panel>
    ))}
  </>
);

function SettingsFrame({ wide, className }: { wide: boolean; className?: string }): ReactElement {
  return (
    <div className={cn("sc-settings-frame", className)}>
      <div className="sc-settings-header">
        <span className="sc-settings-header-icon">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </span>
        <span className="sc-settings-header-title">Settings</span>
        <span className="sc-settings-header-icon">
          <X size={18} strokeWidth={1.8} />
        </span>
      </div>
      <SettingsPanel wide={wide} />
    </div>
  );
}

export function SettingsSection(): ReactElement {
  return <SettingsFrame wide className="sc-settings-frame-wide" />;
}
