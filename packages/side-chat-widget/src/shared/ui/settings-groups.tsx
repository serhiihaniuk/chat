import type { ReactElement, ReactNode } from "react";

import { Check, Palette, Settings as SettingsIcon, type LucideIcon } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { Segmented, type SegmentedItem } from "#shared/ui/segmented";
import { GeneralGroup, type ModelOption } from "#shared/ui/settings-general";

export { DEFAULT_MODEL, type ModelOption } from "#shared/ui/settings-general";

export type ThemePreview = "graphite" | "sage" | "ocean" | "dark";

type ThemeOption = {
  readonly description: string;
  readonly id: ThemePreview;
  readonly name: string;
};

const THEMES: readonly ThemeOption[] = [
  { id: "graphite", name: "Graphite", description: "Neutral grayscale" },
  { id: "sage", name: "Sage", description: "Green-tinted" },
  { id: "ocean", name: "Ocean", description: "Blue-tinted" },
  { id: "dark", name: "Dark", description: "Graphite, inverted" },
];

export type AccentOption = {
  readonly id: "default" | "blue" | "green" | "violet" | "orange";
  readonly label: string;
};

const ACCENTS: readonly AccentOption[] = [
  { id: "default", label: "Default" },
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
  { id: "violet", label: "Violet" },
  { id: "orange", label: "Orange" },
];

const CORNER_ITEMS: readonly SegmentedItem[] = [
  { id: "sharp", label: "Sharp" },
  { id: "default", label: "Default" },
  { id: "rounded", label: "Rounded" },
];

const DENSITY_ITEMS: readonly SegmentedItem[] = [
  { id: "compact", label: "Compact" },
  { id: "cozy", label: "Cozy" },
  { id: "roomy", label: "Roomy" },
];

const SETTINGS_LABEL_CLASS =
  "text-(length:--settings-label-size) font-semibold text-(--settings-label-fg)";

export type SettingsGroup = {
  readonly Icon: LucideIcon;
  readonly id: string;
  readonly label: string;
  readonly render: (narrow: boolean) => ReactNode;
};

export type SettingsState = {
  readonly accent: AccentOption["id"];
  readonly corners: string;
  readonly density: string;
  readonly instructions: string;
  readonly model: ModelOption;
  readonly onAccentChange: (next: AccentOption["id"]) => void;
  readonly onCornersChange: (next: string) => void;
  readonly onDensityChange: (next: string) => void;
  readonly onInstructionsChange: (next: string) => void;
  readonly onModelChange: (next: ModelOption) => void;
  readonly onSendOnEnterChange: (next: boolean) => void;
  readonly onThemeChange: (next: ThemePreview) => void;
  readonly sendOnEnter: boolean;
  readonly theme: ThemePreview;
};

function ThemeSwatch({
  onSelect,
  option,
  selected,
}: {
  readonly onSelect: () => void;
  readonly option: ThemeOption;
  readonly selected: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className="sc-settings-theme-card"
    >
      <span className="sc-settings-theme-chip" data-theme={option.id} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-sm font-medium text-card-foreground">{option.name}</span>
        <span className="text-xs text-muted-foreground">{option.description}</span>
      </span>
      {selected ? (
        <span className="inline-flex shrink-0 text-primary">
          <Check className="size-4" strokeWidth={2.4} />
        </span>
      ) : null}
    </button>
  );
}

function AccentSwatches({
  accent,
  onAccentChange,
}: {
  readonly accent: AccentOption["id"];
  readonly onAccentChange: (next: AccentOption["id"]) => void;
}): ReactElement {
  return (
    <div className="mt-2 flex gap-2">
      {ACCENTS.map((option) => (
        <button
          key={option.id}
          type="button"
          title={option.label}
          aria-label={option.label}
          aria-pressed={accent === option.id}
          data-accent={option.id}
          onClick={() => onAccentChange(option.id)}
          className="sc-settings-accent-swatch"
        />
      ))}
    </div>
  );
}

function ThemeGroup({
  accent,
  corners,
  density,
  narrow,
  onAccentChange,
  onCornersChange,
  onDensityChange,
  onThemeChange,
  theme,
}: {
  readonly accent: AccentOption["id"];
  readonly corners: string;
  readonly density: string;
  readonly narrow: boolean;
  readonly onAccentChange: (next: AccentOption["id"]) => void;
  readonly onCornersChange: (next: string) => void;
  readonly onDensityChange: (next: string) => void;
  readonly onThemeChange: (next: ThemePreview) => void;
  readonly theme: ThemePreview;
}): ReactElement {
  return (
    <div className={cn("flex flex-col", narrow ? "gap-4" : "gap-4.5")}>
      <div>
        {narrow ? null : <div className={SETTINGS_LABEL_CLASS}>Theme</div>}
        <div className="sc-settings-theme-list" data-wide={narrow ? undefined : "true"}>
          {THEMES.map((option) => (
            <ThemeSwatch
              key={option.id}
              option={option}
              selected={theme === option.id}
              onSelect={() => onThemeChange(option.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <div className={SETTINGS_LABEL_CLASS}>Accent</div>
        <AccentSwatches accent={accent} onAccentChange={onAccentChange} />
      </div>

      <div>
        <div className={SETTINGS_LABEL_CLASS}>Corners</div>
        <Segmented
          items={[...CORNER_ITEMS]}
          value={corners}
          onValueChange={onCornersChange}
          className="mt-2"
        />
      </div>

      <div>
        <div className={SETTINGS_LABEL_CLASS}>Density</div>
        <Segmented
          items={[...DENSITY_ITEMS]}
          value={density}
          onValueChange={onDensityChange}
          className="mt-2"
        />
      </div>
    </div>
  );
}

export const createSettingsGroups = ({
  accent,
  corners,
  density,
  instructions,
  model,
  onAccentChange,
  onCornersChange,
  onDensityChange,
  onInstructionsChange,
  onModelChange,
  onSendOnEnterChange,
  onThemeChange,
  sendOnEnter,
  theme,
}: SettingsState): readonly SettingsGroup[] => [
  {
    id: "theme",
    label: "Theme",
    Icon: Palette,
    render: (narrow) => (
      <ThemeGroup
        theme={theme}
        onThemeChange={onThemeChange}
        accent={accent}
        onAccentChange={onAccentChange}
        corners={corners}
        onCornersChange={onCornersChange}
        density={density}
        onDensityChange={onDensityChange}
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
