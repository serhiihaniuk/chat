// The named-theme data is single-sourced in `shared/lib/widget-themes` (the lowest
// layer, so the shared/ui settings picker can read the same list without importing
// upward into `entities`). This module re-exports it as the theme entity's surface.

export {
  DEFAULT_WIDGET_THEME_ID,
  isWidgetThemeId,
  WIDGET_THEME_IDS,
  WIDGET_THEMES,
  type WidgetTheme,
  type WidgetThemeId,
} from "#shared/lib/widget-themes";
