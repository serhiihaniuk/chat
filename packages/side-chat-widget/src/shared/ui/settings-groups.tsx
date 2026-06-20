import type { ReactNode } from "react";

import { Palette, Settings as SettingsIcon, type LucideIcon } from "lucide-react";

import { GeneralGroup, type ModelOption } from "#shared/ui/settings-general";
import { ThemeGroup, type AccentOption, type ThemePreview } from "./settings/theme-group.js";

export { DEFAULT_MODEL, type ModelOption } from "#shared/ui/settings-general";
export type { AccentOption, ThemePreview } from "./settings/theme-group.js";

export type SettingsGroup = {
  readonly Icon: LucideIcon;
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
  readonly instructions: string;
  readonly model: ModelOption;
  readonly onAccentChange: (next: AccentOption["id"]) => void;
  readonly onCornersChange: (next: string) => void;
  readonly onDensityChange: (next: string) => void;
  readonly onElevationChange: (next: string) => void;
  readonly onInstructionsChange: (next: string) => void;
  readonly onModelChange: (next: ModelOption) => void;
  readonly onSendOnEnterChange: (next: boolean) => void;
  readonly onTextSizeChange: (next: string) => void;
  readonly onThemeChange: (next: ThemePreview) => void;
  readonly onTypefaceChange: (next: string) => void;
  readonly sendOnEnter: boolean;
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
  instructions,
  model,
  onAccentChange,
  onCornersChange,
  onDensityChange,
  onElevationChange,
  onInstructionsChange,
  onModelChange,
  onSendOnEnterChange,
  onTextSizeChange,
  onThemeChange,
  onTypefaceChange,
  sendOnEnter,
  textSize,
  theme,
  typeface,
}: SettingsState): readonly SettingsGroup[] => [
  {
    id: "theme",
    label: "Theme",
    Icon: Palette,
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
    Icon: SettingsIcon,
    render: (narrow) => (
      <GeneralGroup
        instructions={instructions}
        onInstructionsChange={onInstructionsChange}
        sendOnEnter={sendOnEnter}
        onSendOnEnterChange={onSendOnEnterChange}
        model={model}
        onModelChange={onModelChange}
        narrow={narrow}
      />
    ),
  },
];
