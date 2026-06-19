/**
 * Settings (responsive).
 *
 * One group state drives both navigators and the same Tabs.Panel set. Wide uses a
 * left rail; narrow keeps Tabs.Root mounted but swaps the navigator to a top
 * Select. Theme rows, accent swatches, field shells, and panel spacing follow the
 * design_widget.html Settings source before any live measurement.
 */
import { useCallback, useState, type CSSProperties, type ReactElement } from "react";

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

// Corners and density re-skin the live surface by mutating the same tokens every
// component reads: --radius and --space-unit. styles.css bridges --space-unit into
// --spacing, so density changes flow through the normal spacing scale.
const CORNER_RADIUS: Record<string, string> = {
  sharp: "0rem",
  default: "0.625rem",
  rounded: "1rem",
};
const DENSITY_UNIT: Record<string, string> = {
  compact: "0.1875rem",
  cozy: "0.25rem",
  comfortable: "0.3125rem",
};

const appearanceStyle = (corners: string, density: string): CSSProperties =>
  ({
    "--radius": CORNER_RADIUS[corners] ?? CORNER_RADIUS["default"],
    "--space-unit": DENSITY_UNIT[density] ?? DENSITY_UNIT["cozy"],
  }) as CSSProperties;

type SettingsPanelProps = {
  /**
   * Controlled appearance lets the real widget pass persisted state, while the
   * standalone showcase can fall back to local state.
   */
  theme?: ThemePreview;
  themeOptions?: readonly ThemePreview[] | undefined;
  onThemeChange?: (next: ThemePreview) => void;
  accent?: AccentOption["id"];
  onAccentChange?: (next: AccentOption["id"]) => void;
  corners?: string;
  onCornersChange?: (next: string) => void;
  density?: string;
  onDensityChange?: (next: string) => void;
  /**
   * False means an outer widget root already applies accent, radius, and density.
   */
  applyAppearance?: boolean;
};

const useControlledValue = <Value,>(
  controlledValue: Value | undefined,
  onChange: ((next: Value) => void) | undefined,
  fallback: Value,
): readonly [Value, (next: Value) => void] => {
  const [localValue, setLocalValue] = useState(fallback);
  const setValue = useCallback(
    (next: Value): void => {
      if (onChange) {
        onChange(next);
        return;
      }
      setLocalValue(next);
    },
    [onChange],
  );
  return [controlledValue ?? localValue, setValue];
};

const appliedAccent = (
  applyAppearance: boolean,
  accent: AccentOption["id"],
): AccentOption["id"] | undefined => {
  if (!applyAppearance || accent === "default") return undefined;
  return accent;
};

const appliedAppearanceStyle = (
  applyAppearance: boolean,
  corners: string,
  density: string,
): CSSProperties | undefined => {
  if (!applyAppearance) return undefined;
  return appearanceStyle(corners, density);
};

export function SettingsPanel({
  theme: themeProp,
  themeOptions,
  onThemeChange,
  accent: accentProp,
  onAccentChange,
  corners: cornersProp,
  onCornersChange,
  density: densityProp,
  onDensityChange,
  applyAppearance = true,
}: SettingsPanelProps): ReactElement {
  const [group, setGroup] = useState("theme");
  const [theme, setTheme] = useControlledValue(themeProp, onThemeChange, "graphite");
  const [accent, setAccent] = useControlledValue(accentProp, onAccentChange, "default");
  const [corners, setCorners] = useControlledValue(cornersProp, onCornersChange, "default");
  const [density, setDensity] = useControlledValue(densityProp, onDensityChange, "cozy");
  const [instructions, setInstructions] = useState("");
  const [sendOnEnter, setSendOnEnter] = useState(true);
  const [model, setModel] = useState<ModelOption>(DEFAULT_MODEL);

  const groups = createSettingsGroups({
    accent,
    availableThemes: themeOptions,
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
      className="sc-settings-root"
      data-sidechat-accent={appliedAccent(applyAppearance, accent)}
      style={appliedAppearanceStyle(applyAppearance, corners, density)}
    >
      {/* Both navigators render; the side-chat-widget container query shows either
          the rail or the top Select using the same breakpoint as the shell. */}
      <WideSettingsNav groups={groups} />
      <div className="sc-settings-narrow shrink-0 border-b border-(--settings-nav-border) p-3">
        <NarrowSettingsSelect active={active} groups={groups} onGroupChange={setGroup} />
      </div>
      <SettingsPanels groups={groups} />
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
  <Tabs.List className="sc-settings-wide w-(--settings-nav-w) shrink-0 flex-col gap-0.5 border-r border-(--settings-nav-border) bg-(--settings-nav-bg) px-2 py-2.5">
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
}: {
  readonly groups: readonly SettingsGroup[];
}): ReactElement => (
  <>
    {groups.map((group) => (
      <Tabs.Panel key={group.id} value={group.id} className="relative min-w-0 flex-1">
        <ScrollArea className="absolute inset-0 p-(--settings-content-pad)">
          {group.render(false)}
        </ScrollArea>
      </Tabs.Panel>
    ))}
  </>
);

function SettingsFrame({ className }: { className?: string }): ReactElement {
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
      <SettingsPanel />
    </div>
  );
}

export function SettingsSection(): ReactElement {
  return <SettingsFrame className="sc-settings-frame-wide" />;
}
