import type { CSSProperties } from "react";

type CssCustomProperties = Readonly<Record<`--${string}`, string>>;

export type WidgetAppearanceStyle = CSSProperties & CssCustomProperties;

const DEFAULT_CORNER_RADIUS = "0.625rem";
const CORNER_RADIUS: Record<string, string> = {
  sharp: "0rem",
  default: DEFAULT_CORNER_RADIUS,
  rounded: "1rem",
};
const DEFAULT_DENSITY_UNIT = "0.25rem";
const DENSITY_UNIT: Record<string, string> = {
  compact: "0.1875rem",
  cozy: DEFAULT_DENSITY_UNIT,
  roomy: "0.3125rem",
};
const DEFAULT_TEXT_SCALE: CssCustomProperties = {
  "--text-2xs": "0.6875rem",
  "--text-xs": "0.75rem",
  "--text-sm": "0.8125rem",
  "--text-base": "0.875rem",
  "--text-md": "0.9375rem",
  "--text-lg": "1.125rem",
  "--text-xl": "1.5rem",
};
const TEXT_SCALE: Readonly<Record<string, CssCustomProperties>> = {
  small: {
    "--text-2xs": "0.625rem",
    "--text-xs": "0.6875rem",
    "--text-sm": "0.75rem",
    "--text-base": "0.8125rem",
    "--text-md": "0.875rem",
    "--text-lg": "1rem",
    "--text-xl": "1.375rem",
  },
  default: DEFAULT_TEXT_SCALE,
  large: {
    "--text-2xs": "0.75rem",
    "--text-xs": "0.8125rem",
    "--text-sm": "0.875rem",
    "--text-base": "0.9375rem",
    "--text-md": "1rem",
    "--text-lg": "1.25rem",
    "--text-xl": "1.625rem",
  },
};
const DEFAULT_TYPEFACE_FAMILY =
  '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const TYPEFACE_FAMILY: Record<string, string> = {
  "plus-jakarta": DEFAULT_TYPEFACE_FAMILY,
  "dm-sans":
    '"DM Sans", "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  "instrument-sans":
    '"Instrument Sans", "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
};
const DEFAULT_ELEVATION_SHADOWS: CssCustomProperties = {
  "--shadow-card": "0 1px 2px 0 oklch(0 0 0 / 0.05), 0 1px 3px 0 oklch(0 0 0 / 0.08)",
  "--shadow-popover": "0 4px 12px -2px oklch(0 0 0 / 0.12), 0 2px 6px -2px oklch(0 0 0 / 0.08)",
  "--shadow-panel": "0 12px 32px -8px oklch(0 0 0 / 0.2), 0 4px 12px -4px oklch(0 0 0 / 0.12)",
};
const ELEVATION_SHADOWS: Readonly<Record<string, CssCustomProperties>> = {
  flat: {
    "--shadow-card": "0 0 #0000",
    "--shadow-popover": "0 0 #0000",
    "--shadow-panel": "0 0 #0000",
  },
  soft: DEFAULT_ELEVATION_SHADOWS,
  raised: {
    "--shadow-card": "0 4px 12px -4px oklch(0 0 0 / 0.16), 0 2px 4px -2px oklch(0 0 0 / 0.12)",
    "--shadow-popover": "0 12px 28px -8px oklch(0 0 0 / 0.22), 0 6px 14px -8px oklch(0 0 0 / 0.16)",
    "--shadow-panel": "0 24px 56px -14px oklch(0 0 0 / 0.28), 0 10px 22px -12px oklch(0 0 0 / 0.2)",
  },
};

export const widgetAppearanceStyle = ({
  corners,
  density,
  elevation,
  textSize,
  typeface,
}: {
  readonly corners: string;
  readonly density: string;
  readonly elevation: string;
  readonly textSize: string;
  readonly typeface: string;
}): WidgetAppearanceStyle => ({
  "--radius": CORNER_RADIUS[corners] ?? DEFAULT_CORNER_RADIUS,
  "--space-unit": DENSITY_UNIT[density] ?? DEFAULT_DENSITY_UNIT,
  "--font-widget": TYPEFACE_FAMILY[typeface] ?? DEFAULT_TYPEFACE_FAMILY,
  ...(TEXT_SCALE[textSize] ?? DEFAULT_TEXT_SCALE),
  ...(ELEVATION_SHADOWS[elevation] ?? DEFAULT_ELEVATION_SHADOWS),
});
