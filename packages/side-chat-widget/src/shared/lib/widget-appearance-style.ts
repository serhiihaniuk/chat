const CORNER_RADIUS: Record<string, string> = {
  sharp: "0rem",
  default: "0.625rem",
  rounded: "1rem",
};
const DENSITY_UNIT: Record<string, string> = {
  compact: "0.1875rem",
  cozy: "0.25rem",
  roomy: "0.3125rem",
};
const TEXT_SCALE: Record<string, Record<string, string>> = {
  small: {
    "--text-2xs": "0.625rem",
    "--text-xs": "0.6875rem",
    "--text-sm": "0.75rem",
    "--text-base": "0.8125rem",
    "--text-md": "0.875rem",
    "--text-lg": "1rem",
    "--text-xl": "1.375rem",
  },
  default: {
    "--text-2xs": "0.6875rem",
    "--text-xs": "0.75rem",
    "--text-sm": "0.8125rem",
    "--text-base": "0.875rem",
    "--text-md": "0.9375rem",
    "--text-lg": "1.125rem",
    "--text-xl": "1.5rem",
  },
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
const TYPEFACE_FAMILY: Record<string, string> = {
  jakarta: '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  "ibm-plex":
    '"IBM Plex Sans", "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
};
const ELEVATION_SHADOWS: Record<string, Record<string, string>> = {
  flat: {
    "--shadow-card": "none",
    "--shadow-popover": "none",
    "--shadow-panel": "none",
  },
  soft: {
    "--shadow-card": "0 1px 2px 0 oklch(0 0 0 / 0.05), 0 1px 3px 0 oklch(0 0 0 / 0.08)",
    "--shadow-popover": "0 4px 12px -2px oklch(0 0 0 / 0.12), 0 2px 6px -2px oklch(0 0 0 / 0.08)",
    "--shadow-panel": "0 12px 32px -8px oklch(0 0 0 / 0.2), 0 4px 12px -4px oklch(0 0 0 / 0.12)",
  },
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
}): Record<string, string> => ({
  "--radius": CORNER_RADIUS[corners] ?? CORNER_RADIUS["default"]!,
  "--space-unit": DENSITY_UNIT[density] ?? DENSITY_UNIT["cozy"]!,
  "--font-widget": TYPEFACE_FAMILY[typeface] ?? TYPEFACE_FAMILY["jakarta"]!,
  ...(TEXT_SCALE[textSize] ?? TEXT_SCALE["default"]!),
  ...(ELEVATION_SHADOWS[elevation] ?? ELEVATION_SHADOWS["soft"]!),
});
