// Named widget themes. Graphite is the default and carries no root attribute, so it
// tracks the host's light/dark. Sage and Ocean are light-only token blocks scoped to
// the widget root (see styles.css). The list drives the settings theme picker.

export const WIDGET_THEME_IDS = ["graphite", "sage", "ocean"] as const;

export type WidgetThemeId = (typeof WIDGET_THEME_IDS)[number];

export const DEFAULT_WIDGET_THEME_ID: WidgetThemeId = "graphite";

export type WidgetTheme = {
  readonly id: WidgetThemeId;
  readonly name: string;
  readonly description: string;
};

export const WIDGET_THEMES: readonly WidgetTheme[] = [
  {
    id: "graphite",
    name: "Graphite",
    description: "Clean neutral grayscale — the default look.",
  },
  {
    id: "sage",
    name: "Sage",
    description: "Soft, calm green neutrals.",
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Cool, focused blues.",
  },
];

export const isWidgetThemeId = (value: string | null): value is WidgetThemeId =>
  value !== null && (WIDGET_THEME_IDS as readonly string[]).includes(value);
