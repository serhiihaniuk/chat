import { useCallback, useState, type CSSProperties } from "react";

/**
 * Persists appearance controls that re-skin the widget root through shared tokens.
 *
 * Theme selection still owns the named palette. This hook owns the lighter-weight
 * controls that can sit on top of a palette: accent color, corner radius, density
 * spacing, type scale, typeface, and elevation. Callers spread appearanceRootProps
 * onto the widget root so descendants inherit the same token overrides.
 */
export const WIDGET_ACCENT_IDS = {
  DEFAULT: "default",
  BLUE: "blue",
  GREEN: "green",
  VIOLET: "violet",
  ORANGE: "orange",
} as const;
export type WidgetAccentId = (typeof WIDGET_ACCENT_IDS)[keyof typeof WIDGET_ACCENT_IDS];

export const WIDGET_CORNERS_IDS = {
  SHARP: "sharp",
  DEFAULT: "default",
  ROUNDED: "rounded",
} as const;
export type WidgetCornersId = (typeof WIDGET_CORNERS_IDS)[keyof typeof WIDGET_CORNERS_IDS];

export const WIDGET_DENSITY_IDS = {
  COMPACT: "compact",
  COZY: "cozy",
  ROOMY: "roomy",
} as const;
export type WidgetDensityId = (typeof WIDGET_DENSITY_IDS)[keyof typeof WIDGET_DENSITY_IDS];

export const WIDGET_TEXT_SIZE_IDS = {
  SMALL: "small",
  DEFAULT: "default",
  LARGE: "large",
} as const;
export type WidgetTextSizeId = (typeof WIDGET_TEXT_SIZE_IDS)[keyof typeof WIDGET_TEXT_SIZE_IDS];

export const WIDGET_TYPEFACE_IDS = {
  PLUS_JAKARTA: "plus-jakarta",
  DM_SANS: "dm-sans",
  INSTRUMENT_SANS: "instrument-sans",
} as const;
export type WidgetTypefaceId = (typeof WIDGET_TYPEFACE_IDS)[keyof typeof WIDGET_TYPEFACE_IDS];

export const WIDGET_ELEVATION_IDS = {
  FLAT: "flat",
  SOFT: "soft",
  RAISED: "raised",
} as const;
export type WidgetElevationId = (typeof WIDGET_ELEVATION_IDS)[keyof typeof WIDGET_ELEVATION_IDS];

const ACCENTS: readonly WidgetAccentId[] = Object.values(WIDGET_ACCENT_IDS);
const CORNERS: readonly WidgetCornersId[] = Object.values(WIDGET_CORNERS_IDS);
const DENSITIES: readonly WidgetDensityId[] = Object.values(WIDGET_DENSITY_IDS);
const TEXT_SIZES: readonly WidgetTextSizeId[] = Object.values(WIDGET_TEXT_SIZE_IDS);
const TYPEFACES: readonly WidgetTypefaceId[] = Object.values(WIDGET_TYPEFACE_IDS);
const ELEVATIONS: readonly WidgetElevationId[] = Object.values(WIDGET_ELEVATION_IDS);

const CORNER_RADIUS: Record<WidgetCornersId, string> = {
  sharp: "0rem",
  default: "0.625rem",
  rounded: "1rem",
};
const DENSITY_UNIT: Record<WidgetDensityId, string> = {
  compact: "0.1875rem",
  cozy: "0.25rem",
  roomy: "0.3125rem",
};
const TEXT_SCALE: Record<WidgetTextSizeId, Record<string, string>> = {
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
const TYPEFACE_FAMILY: Record<WidgetTypefaceId, string> = {
  "plus-jakarta":
    '"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  "dm-sans":
    '"DM Sans", "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  "instrument-sans":
    '"Instrument Sans", "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
};
const ELEVATION_SHADOWS: Record<WidgetElevationId, Record<string, string>> = {
  flat: {
    "--shadow-card": "0 0 #0000",
    "--shadow-popover": "0 0 #0000",
    "--shadow-panel": "0 0 #0000",
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

const DEFAULT_STORAGE_KEY = "side-chat-widget:appearance";

export type WidgetAppearanceState = {
  readonly accent: WidgetAccentId;
  readonly corners: WidgetCornersId;
  readonly density: WidgetDensityId;
  readonly elevation: WidgetElevationId;
  readonly textSize: WidgetTextSizeId;
  readonly typeface: WidgetTypefaceId;
};

export type WidgetAppearanceRootProps = {
  readonly "data-sidechat-accent"?: WidgetAccentId;
  readonly style: CSSProperties;
};

export type WidgetAppearanceController = WidgetAppearanceState & {
  readonly setAccent: (next: string) => void;
  readonly setCorners: (next: string) => void;
  readonly setDensity: (next: string) => void;
  readonly setElevation: (next: string) => void;
  readonly setTextSize: (next: string) => void;
  readonly setTypeface: (next: string) => void;
  readonly appearanceRootProps: WidgetAppearanceRootProps;
};

type WidgetAppearanceUpdate = (patch: Partial<WidgetAppearanceState>) => void;

export const useWidgetAppearance = ({
  storageKey = DEFAULT_STORAGE_KEY,
}: {
  readonly storageKey?: string | undefined;
} = {}): WidgetAppearanceController => {
  const [state, update] = useStoredAppearance(storageKey);

  return {
    ...state,
    setAccent: useAppearanceSetter("accent", ACCENTS, update),
    setCorners: useAppearanceSetter("corners", CORNERS, update),
    setDensity: useAppearanceSetter("density", DENSITIES, update),
    setElevation: useAppearanceSetter("elevation", ELEVATIONS, update),
    setTextSize: useAppearanceSetter("textSize", TEXT_SIZES, update),
    setTypeface: useAppearanceSetter("typeface", TYPEFACES, update),
    appearanceRootProps: createAppearanceRootProps(state),
  };
};

const useStoredAppearance = (
  storageKey: string | undefined,
): readonly [WidgetAppearanceState, WidgetAppearanceUpdate] => {
  const [state, setState] = useState<WidgetAppearanceState>(() => readStored(storageKey));
  const update = useCallback(
    (patch: Partial<WidgetAppearanceState>) => {
      setState((previous) => {
        const next = { ...previous, ...patch };
        writeStored(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );
  return [state, update];
};

const useAppearanceSetter = <Key extends keyof WidgetAppearanceState>(
  key: Key,
  list: readonly WidgetAppearanceState[Key][],
  update: WidgetAppearanceUpdate,
): ((next: string) => void) =>
  useCallback(
    (next: string) => {
      if (isOneOf(list, next)) update({ [key]: next } as Partial<WidgetAppearanceState>);
    },
    [key, list, update],
  );

const createAppearanceRootProps = (state: WidgetAppearanceState): WidgetAppearanceRootProps => ({
  ...(state.accent === "default" ? {} : { "data-sidechat-accent": state.accent }),
  style: {
    "--radius": CORNER_RADIUS[state.corners],
    "--space-unit": DENSITY_UNIT[state.density],
    "--font-widget": TYPEFACE_FAMILY[state.typeface],
    ...TEXT_SCALE[state.textSize],
    ...ELEVATION_SHADOWS[state.elevation],
  } as CSSProperties,
});

const DEFAULTS: WidgetAppearanceState = {
  accent: WIDGET_ACCENT_IDS.DEFAULT,
  corners: WIDGET_CORNERS_IDS.DEFAULT,
  density: WIDGET_DENSITY_IDS.COZY,
  elevation: WIDGET_ELEVATION_IDS.SOFT,
  textSize: WIDGET_TEXT_SIZE_IDS.DEFAULT,
  typeface: WIDGET_TYPEFACE_IDS.PLUS_JAKARTA,
};

const isOneOf = <Value extends string>(list: readonly Value[], value: unknown): value is Value =>
  typeof value === "string" && list.includes(value as Value);

const readStored = (storageKey: string | undefined): WidgetAppearanceState => {
  if (!storageKey || typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULTS;
    const record = parsed as Record<string, unknown>;
    return {
      accent: isOneOf(ACCENTS, record["accent"]) ? record["accent"] : DEFAULTS.accent,
      corners: isOneOf(CORNERS, record["corners"]) ? record["corners"] : DEFAULTS.corners,
      density: readDensity(record["density"]),
      elevation: isOneOf(ELEVATIONS, record["elevation"])
        ? record["elevation"]
        : DEFAULTS.elevation,
      textSize: isOneOf(TEXT_SIZES, record["textSize"]) ? record["textSize"] : DEFAULTS.textSize,
      typeface: readTypeface(record["typeface"]),
    };
  } catch {
    return DEFAULTS;
  }
};

const readDensity = (value: unknown): WidgetDensityId => {
  if (value === "comfortable") return WIDGET_DENSITY_IDS.ROOMY;
  return isOneOf(DENSITIES, value) ? value : DEFAULTS.density;
};

const readTypeface = (value: unknown): WidgetTypefaceId => {
  if (value === "jakarta") return WIDGET_TYPEFACE_IDS.PLUS_JAKARTA;
  return isOneOf(TYPEFACES, value) ? value : DEFAULTS.typeface;
};

const writeStored = (storageKey: string | undefined, state: WidgetAppearanceState): void => {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Appearance still works for the current session when storage is unavailable.
  }
};
