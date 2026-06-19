import { useCallback, useState, type CSSProperties } from "react";

/**
 * Persists appearance controls that re-skin the widget root through shared tokens.
 *
 * Theme selection still owns the named palette. This hook owns the lighter-weight
 * controls that can sit on top of a palette: accent color, corner radius, and density
 * spacing. Callers spread appearanceRootProps onto the widget root so descendants
 * inherit the same --primary, --radius, and --space-unit values.
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
  COMFORTABLE: "comfortable",
} as const;
export type WidgetDensityId = (typeof WIDGET_DENSITY_IDS)[keyof typeof WIDGET_DENSITY_IDS];

const ACCENTS: readonly WidgetAccentId[] = Object.values(WIDGET_ACCENT_IDS);
const CORNERS: readonly WidgetCornersId[] = Object.values(WIDGET_CORNERS_IDS);
const DENSITIES: readonly WidgetDensityId[] = Object.values(WIDGET_DENSITY_IDS);

const CORNER_RADIUS: Record<WidgetCornersId, string> = {
  sharp: "0rem",
  default: "0.625rem",
  rounded: "1rem",
};
const DENSITY_UNIT: Record<WidgetDensityId, string> = {
  compact: "0.1875rem",
  cozy: "0.25rem",
  comfortable: "0.3125rem",
};

const DEFAULT_STORAGE_KEY = "side-chat-widget:appearance";

export type WidgetAppearanceState = {
  readonly accent: WidgetAccentId;
  readonly corners: WidgetCornersId;
  readonly density: WidgetDensityId;
};

export type WidgetAppearanceRootProps = {
  readonly "data-sidechat-accent"?: WidgetAccentId;
  readonly style: CSSProperties;
};

export type WidgetAppearanceController = WidgetAppearanceState & {
  readonly setAccent: (next: string) => void;
  readonly setCorners: (next: string) => void;
  readonly setDensity: (next: string) => void;
  readonly appearanceRootProps: WidgetAppearanceRootProps;
};

export const useWidgetAppearance = ({
  storageKey = DEFAULT_STORAGE_KEY,
}: {
  readonly storageKey?: string | undefined;
} = {}): WidgetAppearanceController => {
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

  return {
    ...state,
    setAccent: useCallback(
      (accent: string) => {
        if (isOneOf(ACCENTS, accent)) update({ accent });
      },
      [update],
    ),
    setCorners: useCallback(
      (corners: string) => {
        if (isOneOf(CORNERS, corners)) update({ corners });
      },
      [update],
    ),
    setDensity: useCallback(
      (density: string) => {
        if (isOneOf(DENSITIES, density)) update({ density });
      },
      [update],
    ),
    appearanceRootProps: {
      ...(state.accent === "default" ? {} : { "data-sidechat-accent": state.accent }),
      style: {
        "--radius": CORNER_RADIUS[state.corners],
        "--space-unit": DENSITY_UNIT[state.density],
      } as CSSProperties,
    },
  };
};

const DEFAULTS: WidgetAppearanceState = {
  accent: WIDGET_ACCENT_IDS.DEFAULT,
  corners: WIDGET_CORNERS_IDS.DEFAULT,
  density: WIDGET_DENSITY_IDS.COZY,
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
      density: isOneOf(DENSITIES, record["density"]) ? record["density"] : DEFAULTS.density,
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
