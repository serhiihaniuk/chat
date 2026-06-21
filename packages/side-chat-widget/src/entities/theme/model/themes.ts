// Named widget themes — four light palettes, no dark mode. Graphite is the default
// and carries no root attribute (its tokens live on :root); Sapphire, Sage, and Ocean
// are token blocks scoped to the widget root via data-sidechat-theme (see styles.css).
// The list drives the settings theme picker.

export const WIDGET_THEME_IDS = ["graphite", "sapphire", "sage", "ocean"] as const;

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
    description: "Cool charcoal, premium neutral.",
  },
  {
    id: "sapphire",
    name: "Sapphire",
    description: "Deep navy, premium banking.",
  },
  {
    id: "sage",
    name: "Sage",
    description: "Deep emerald, premium green.",
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Blue neutrals, blue primary.",
  },
];

export const isWidgetThemeId = (value: string | null): value is WidgetThemeId =>
  value !== null && (WIDGET_THEME_IDS as readonly string[]).includes(value);
