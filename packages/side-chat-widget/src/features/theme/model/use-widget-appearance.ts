import { useCallback, useState } from "react";
import { parseJsonRecord } from "@side-chat/shared";

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
  readonly "data-sidechat-corners": WidgetCornersId;
  readonly "data-sidechat-density": WidgetDensityId;
  readonly "data-sidechat-elevation": WidgetElevationId;
  readonly "data-sidechat-text-size": WidgetTextSizeId;
  readonly "data-sidechat-typeface": WidgetTypefaceId;
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
    setAccent: useAppearanceSetter("accent", update),
    setCorners: useAppearanceSetter("corners", update),
    setDensity: useAppearanceSetter("density", update),
    setElevation: useAppearanceSetter("elevation", update),
    setTextSize: useAppearanceSetter("textSize", update),
    setTypeface: useAppearanceSetter("typeface", update),
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

const useAppearanceSetter = (
  key: keyof WidgetAppearanceState,
  update: WidgetAppearanceUpdate,
): ((next: string) => void) =>
  useCallback(
    (next: string) => {
      const patch = readAppearancePatch(key, next);
      if (patch) update(patch);
    },
    [key, update],
  );

const readAppearancePatch = (
  key: keyof WidgetAppearanceState,
  value: string,
): Partial<WidgetAppearanceState> | undefined => APPEARANCE_PATCH_READERS[key](value);

type AppearancePatchReader = (value: string) => Partial<WidgetAppearanceState> | undefined;

const APPEARANCE_PATCH_READERS = {
  accent: readAccentPatch,
  corners: readCornersPatch,
  density: readDensityPatch,
  elevation: readElevationPatch,
  textSize: readTextSizePatch,
  typeface: readTypefacePatch,
} satisfies Record<keyof WidgetAppearanceState, AppearancePatchReader>;

function readAccentPatch(value: string): Partial<WidgetAppearanceState> | undefined {
  return isOneOf(ACCENTS, value) ? { accent: value } : undefined;
}

function readCornersPatch(value: string): Partial<WidgetAppearanceState> | undefined {
  return isOneOf(CORNERS, value) ? { corners: value } : undefined;
}

function readDensityPatch(value: string): Partial<WidgetAppearanceState> | undefined {
  return isOneOf(DENSITIES, value) ? { density: value } : undefined;
}

function readElevationPatch(value: string): Partial<WidgetAppearanceState> | undefined {
  return isOneOf(ELEVATIONS, value) ? { elevation: value } : undefined;
}

function readTextSizePatch(value: string): Partial<WidgetAppearanceState> | undefined {
  return isOneOf(TEXT_SIZES, value) ? { textSize: value } : undefined;
}

function readTypefacePatch(value: string): Partial<WidgetAppearanceState> | undefined {
  return isOneOf(TYPEFACES, value) ? { typeface: value } : undefined;
}

const createAppearanceRootProps = (state: WidgetAppearanceState): WidgetAppearanceRootProps => ({
  ...(state.accent === "default" ? {} : { "data-sidechat-accent": state.accent }),
  "data-sidechat-corners": state.corners,
  "data-sidechat-density": state.density,
  "data-sidechat-elevation": state.elevation,
  "data-sidechat-text-size": state.textSize,
  "data-sidechat-typeface": state.typeface,
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
  typeof value === "string" && list.some((candidate) => candidate === value);

const readStored = (storageKey: string | undefined): WidgetAppearanceState => {
  if (!storageKey || typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULTS;
    const parsed = parseJsonRecord(raw);
    if (!parsed) return DEFAULTS;
    const record = parsed;
    return {
      accent: isOneOf(ACCENTS, record["accent"]) ? record["accent"] : DEFAULTS.accent,
      corners: isOneOf(CORNERS, record["corners"]) ? record["corners"] : DEFAULTS.corners,
      density: isOneOf(DENSITIES, record["density"]) ? record["density"] : DEFAULTS.density,
      elevation: isOneOf(ELEVATIONS, record["elevation"])
        ? record["elevation"]
        : DEFAULTS.elevation,
      textSize: isOneOf(TEXT_SIZES, record["textSize"]) ? record["textSize"] : DEFAULTS.textSize,
      typeface: isOneOf(TYPEFACES, record["typeface"]) ? record["typeface"] : DEFAULTS.typeface,
    };
  } catch {
    return DEFAULTS;
  }
};

const writeStored = (storageKey: string | undefined, state: WidgetAppearanceState): void => {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Appearance still works for the current session when storage is unavailable.
  }
};
