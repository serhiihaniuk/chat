import type { ReactElement } from "react";

import { cn } from "#shared/lib/cn";
import { Segmented, type SegmentedItem } from "#shared/ui/segmented";
import {
  THEME_PREVIEW_IDS,
  ThemePreviewCard,
  type ThemePreview,
  type ThemePreviewOption,
} from "./theme-preview-card.js";

export type { ThemePreview } from "./theme-preview-card.js";

const THEMES: readonly ThemePreviewOption[] = [
  {
    id: THEME_PREVIEW_IDS.GRAPHITE,
    name: "Graphite",
    description: "Cool charcoal, premium neutral.",
  },
  {
    id: THEME_PREVIEW_IDS.SAGE,
    name: "Sage",
    description: "Deep emerald, premium green.",
  },
  {
    id: THEME_PREVIEW_IDS.OCEAN,
    name: "Ocean",
    description: "Blue neutrals, blue primary.",
  },
  {
    id: THEME_PREVIEW_IDS.SAPPHIRE,
    name: "Sapphire",
    description: "Deep navy, premium banking.",
  },
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

const TEXT_SIZE_ITEMS: readonly SegmentedItem[] = [
  { id: "small", label: "Small" },
  { id: "default", label: "Default" },
  { id: "large", label: "Large" },
];

const TYPEFACE_ITEMS: readonly SegmentedItem[] = [
  { id: "plus-jakarta", label: "Plus Jakarta Sans" },
  { id: "dm-sans", label: "DM Sans" },
  { id: "instrument-sans", label: "Instrument Sans" },
];

const ELEVATION_ITEMS: readonly SegmentedItem[] = [
  { id: "flat", label: "Flat" },
  { id: "soft", label: "Soft" },
  { id: "raised", label: "Raised" },
];

const SETTINGS_LABEL_CLASS =
  "text-(length:--settings-label-size) font-semibold text-(--settings-label-fg)";

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

function AppearanceSegment({
  items,
  label,
  onValueChange,
  value,
}: {
  readonly items: readonly SegmentedItem[];
  readonly label: string;
  readonly onValueChange: (next: string) => void;
  readonly value: string;
}): ReactElement {
  return (
    <div>
      <div className={SETTINGS_LABEL_CLASS}>{label}</div>
      <Segmented items={[...items]} value={value} onValueChange={onValueChange} className="mt-2" />
    </div>
  );
}

export function ThemeGroup({
  accent,
  availableThemes,
  corners,
  density,
  elevation,
  narrow,
  onAccentChange,
  onCornersChange,
  onDensityChange,
  onElevationChange,
  onTextSizeChange,
  onThemeChange,
  onTypefaceChange,
  textSize,
  theme,
  typeface,
}: {
  readonly accent: AccentOption["id"];
  readonly availableThemes?: readonly ThemePreview[] | undefined;
  readonly corners: string;
  readonly density: string;
  readonly elevation: string;
  readonly narrow: boolean;
  readonly onAccentChange: (next: AccentOption["id"]) => void;
  readonly onCornersChange: (next: string) => void;
  readonly onDensityChange: (next: string) => void;
  readonly onElevationChange: (next: string) => void;
  readonly onTextSizeChange: (next: string) => void;
  readonly onThemeChange: (next: ThemePreview) => void;
  readonly onTypefaceChange: (next: string) => void;
  readonly textSize: string;
  readonly theme: ThemePreview;
  readonly typeface: string;
}): ReactElement {
  const themes = availableThemes
    ? THEMES.filter((option) => availableThemes.includes(option.id))
    : THEMES;

  return (
    <div className={cn("flex flex-col", narrow ? "gap-4" : "gap-4.5")}>
      <div>
        {narrow ? null : <div className={SETTINGS_LABEL_CLASS}>Theme</div>}
        <div className="sc-settings-theme-list" data-wide={narrow ? undefined : "true"}>
          {themes.map((option) => (
            <ThemePreviewCard
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

      <AppearanceSegment
        label="Corners"
        items={CORNER_ITEMS}
        value={corners}
        onValueChange={onCornersChange}
      />
      <AppearanceSegment
        label="Density"
        items={DENSITY_ITEMS}
        value={density}
        onValueChange={onDensityChange}
      />
      <AppearanceSegment
        label="Text size"
        items={TEXT_SIZE_ITEMS}
        value={textSize}
        onValueChange={onTextSizeChange}
      />
      <AppearanceSegment
        label="Typeface"
        items={TYPEFACE_ITEMS}
        value={typeface}
        onValueChange={onTypefaceChange}
      />
      <AppearanceSegment
        label="Elevation"
        items={ELEVATION_ITEMS}
        value={elevation}
        onValueChange={onElevationChange}
      />
    </div>
  );
}
