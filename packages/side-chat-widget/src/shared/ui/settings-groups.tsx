import type { ReactNode } from "react";

import { GeneralGroup } from "#shared/ui/settings-general";
import { ThemeGroup, type AccentOption, type ThemePreview } from "./settings/theme-group.js";

export type { AccentOption, ThemePreview } from "./settings/theme-group.js";

export type SettingsGroup = {
  readonly description: string;
  readonly id: string;
  readonly label: string;
  readonly render: (narrow: boolean) => ReactNode;
};

export type SettingsState = {
  readonly accent: AccentOption["id"];
  readonly availableThemes?: readonly ThemePreview[] | undefined;
  readonly corners: string;
  readonly density: string;
  readonly elevation: string;
  readonly onAccentChange: (next: AccentOption["id"]) => void;
  readonly onCornersChange: (next: string) => void;
  readonly onDensityChange: (next: string) => void;
  readonly onElevationChange: (next: string) => void;
  readonly onSendWithCtrlEnterChange: (next: boolean) => void;
  readonly onTextSizeChange: (next: string) => void;
  readonly onThemeChange: (next: ThemePreview) => void;
  readonly onTypefaceChange: (next: string) => void;
  readonly sendWithCtrlEnter: boolean;
  readonly textSize: string;
  readonly theme: ThemePreview;
  readonly typeface: string;
};

export const createSettingsGroups = ({
  accent,
  availableThemes,
  corners,
  density,
  elevation,
  onAccentChange,
  onCornersChange,
  onDensityChange,
  onElevationChange,
  onSendWithCtrlEnterChange,
  onTextSizeChange,
  onThemeChange,
  onTypefaceChange,
  sendWithCtrlEnter,
  textSize,
  theme,
  typeface,
}: SettingsState): readonly SettingsGroup[] => [
  {
    id: "theme",
    label: "Theme",
    description: "Appearance controls",
    render: (narrow) => (
      <ThemeGroup
        theme={theme}
        onThemeChange={onThemeChange}
        availableThemes={availableThemes}
        accent={accent}
        onAccentChange={onAccentChange}
        corners={corners}
        onCornersChange={onCornersChange}
        density={density}
        onDensityChange={onDensityChange}
        elevation={elevation}
        onElevationChange={onElevationChange}
        textSize={textSize}
        onTextSizeChange={onTextSizeChange}
        typeface={typeface}
        onTypefaceChange={onTypefaceChange}
        narrow={narrow}
      />
    ),
  },
  {
    id: "general",
    label: "General",
    description: "Keyboard shortcut",
    render: (narrow) => (
      <GeneralGroup
        sendWithCtrlEnter={sendWithCtrlEnter}
        onSendWithCtrlEnterChange={onSendWithCtrlEnterChange}
        narrow={narrow}
      />
    ),
  },
];
