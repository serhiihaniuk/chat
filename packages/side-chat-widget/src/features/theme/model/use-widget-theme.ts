import { DEFAULT_WIDGET_THEME_ID, isWidgetThemeId, type WidgetThemeId } from "#entities/theme";
import { useCallback, useState } from "react";

const DEFAULT_STORAGE_KEY = "side-chat-widget:theme";

export type WidgetThemeRootProps = {
  readonly "data-sidechat-theme"?: WidgetThemeId;
};

export type WidgetThemeController = {
  readonly themeId: WidgetThemeId;
  readonly setTheme: (themeId: WidgetThemeId) => void;
  // Spread onto the widget root element. Graphite carries no attribute so it stays
  // responsive to the host's light/dark; named themes scope their palette to the root.
  readonly themeRootProps: WidgetThemeRootProps;
};

// Owns the selected theme and its browser-local persistence. Returns the data
// attribute to apply to the widget root rather than mutating the DOM directly, so
// theming stays declarative and testable.
export const useWidgetTheme = ({
  defaultTheme,
  storageKey = DEFAULT_STORAGE_KEY,
}: {
  readonly defaultTheme: WidgetThemeId | undefined;
  readonly storageKey: string | undefined;
}): WidgetThemeController => {
  const [themeId, setThemeId] = useState<WidgetThemeId>(
    () => readStoredTheme(storageKey) ?? defaultTheme ?? DEFAULT_WIDGET_THEME_ID,
  );

  const setTheme = useCallback(
    (next: WidgetThemeId) => {
      setThemeId(next);
      writeStoredTheme(storageKey, next);
    },
    [storageKey],
  );

  return {
    themeId,
    setTheme,
    themeRootProps: themeId === DEFAULT_WIDGET_THEME_ID ? {} : { "data-sidechat-theme": themeId },
  };
};

const readStoredTheme = (storageKey: string | undefined): WidgetThemeId | undefined => {
  if (!storageKey || typeof window === "undefined") return undefined;
  try {
    const stored = window.localStorage.getItem(storageKey);
    return isWidgetThemeId(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
};

const writeStoredTheme = (storageKey: string | undefined, themeId: WidgetThemeId): void => {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, themeId);
  } catch {
    // Persistence is best-effort; private-mode or quota errors must not break theming.
  }
};
