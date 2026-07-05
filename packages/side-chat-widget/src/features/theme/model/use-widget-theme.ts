import { DEFAULT_WIDGET_THEME_ID, isWidgetThemeId, type WidgetThemeId } from "#entities/theme";
import { useCallback, useState } from "react";

const DEFAULT_STORAGE_KEY = "side-chat-widget:theme";

export type WidgetThemeController = {
  readonly themeId: WidgetThemeId;
  readonly setTheme: (themeId: WidgetThemeId) => void;
};

// Owns the selected theme and its browser-local persistence. Exposes the selected
// theme id and a setter; the widget root binds `data-sidechat-theme` from `themeId`.
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

  return { themeId, setTheme };
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
