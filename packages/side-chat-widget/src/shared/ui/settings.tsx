import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

import { Tabs } from "@base-ui/react/tabs";
import { ChevronLeft, X } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { widgetAppearanceStyle } from "#shared/lib/widget-appearance-style";
import { ScrollArea } from "#shared/ui/scroll-area";
import {
  createSettingsGroups,
  type AccentOption,
  type SettingsGroup,
  type ThemePreview,
} from "#shared/ui/settings-groups";
import { NarrowSettingsSelect, WideSettingsNav } from "./settings/settings-nav.js";

type SettingsPanelProps = {
  theme?: ThemePreview;
  themeOptions?: readonly ThemePreview[] | undefined;
  onThemeChange?: (next: ThemePreview) => void;
  accent?: AccentOption["id"];
  onAccentChange?: (next: AccentOption["id"]) => void;
  corners?: string;
  onCornersChange?: (next: string) => void;
  density?: string;
  onDensityChange?: (next: string) => void;
  elevation?: string;
  onElevationChange?: (next: string) => void;
  textSize?: string;
  onTextSizeChange?: (next: string) => void;
  typeface?: string;
  onTypefaceChange?: (next: string) => void;
  sendWithCtrlEnter?: boolean;
  onSendWithCtrlEnterChange?: (next: boolean) => void;
  toolDetail?: string;
  onToolDetailChange?: (next: string) => void;
  applyAppearance?: boolean;
  header?: ReactNode;
  railHeader?: ReactNode;
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
  textSize: string,
  typeface: string,
  elevation: string,
): CSSProperties | undefined => {
  if (!applyAppearance) return undefined;
  return widgetAppearanceStyle({
    corners,
    density,
    elevation,
    textSize,
    typeface,
  });
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
  elevation: elevationProp,
  onElevationChange,
  textSize: textSizeProp,
  onTextSizeChange,
  typeface: typefaceProp,
  onTypefaceChange,
  sendWithCtrlEnter: sendWithCtrlEnterProp,
  onSendWithCtrlEnterChange,
  toolDetail: toolDetailProp,
  onToolDetailChange,
  applyAppearance = true,
  header,
  railHeader,
}: SettingsPanelProps): ReactElement {
  const [group, setGroup] = useState("theme");
  const [theme, setTheme] = useControlledValue(themeProp, onThemeChange, "graphite");
  const [accent, setAccent] = useControlledValue(accentProp, onAccentChange, "default");
  const [corners, setCorners] = useControlledValue(cornersProp, onCornersChange, "default");
  const [density, setDensity] = useControlledValue(densityProp, onDensityChange, "cozy");
  const [elevation, setElevation] = useControlledValue(elevationProp, onElevationChange, "soft");
  const [textSize, setTextSize] = useControlledValue(textSizeProp, onTextSizeChange, "default");
  const [typeface, setTypeface] = useControlledValue(
    typefaceProp,
    onTypefaceChange,
    "plus-jakarta",
  );
  const [sendWithCtrlEnter, setSendWithCtrlEnter] = useControlledValue(
    sendWithCtrlEnterProp,
    onSendWithCtrlEnterChange,
    false,
  );
  const [toolDetail, setToolDetail] = useControlledValue(
    toolDetailProp,
    onToolDetailChange,
    "full",
  );

  const groups = createSettingsGroups({
    accent,
    availableThemes: themeOptions,
    corners,
    density,
    elevation,
    onAccentChange: setAccent,
    onCornersChange: setCorners,
    onDensityChange: setDensity,
    onElevationChange: setElevation,
    onSendWithCtrlEnterChange: setSendWithCtrlEnter,
    onTextSizeChange: setTextSize,
    onThemeChange: setTheme,
    onToolDetailChange: setToolDetail,
    onTypefaceChange: setTypeface,
    sendWithCtrlEnter,
    textSize,
    theme,
    toolDetail,
    typeface,
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
      style={appliedAppearanceStyle(
        applyAppearance,
        corners,
        density,
        textSize,
        typeface,
        elevation,
      )}
    >
      {/* Both navigators render; the side-chat-widget container query shows either
          the rail or the top Select using the same breakpoint as the shell. */}
      <WideSettingsNav activeGroupId={group} groups={groups} railHeader={railHeader} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {header}
        <div className="sc-settings-narrow shrink-0 border-b border-(--settings-nav-border) p-3">
          <NarrowSettingsSelect active={active} groups={groups} onGroupChange={setGroup} />
        </div>
        <SettingsPanels groups={groups} />
      </div>
    </Tabs.Root>
  );
}

const findActiveGroup = (groups: readonly SettingsGroup[], groupId: string): SettingsGroup => {
  const active = groups.find((candidate) => candidate.id === groupId) ?? groups[0];
  if (!active) throw new Error("Settings require at least one group");
  return active;
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
          <div className="mx-auto w-full max-w-measure-message">{group.render(false)}</div>
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
          <ChevronLeft size={18} strokeWidth={1.8} />
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
