import type { ReactElement } from "react";

export const THEME_PREVIEW_IDS = {
  GRAPHITE: "graphite",
  SAPPHIRE: "sapphire",
  SAGE: "sage",
  OCEAN: "ocean",
} as const;

export type ThemePreview = (typeof THEME_PREVIEW_IDS)[keyof typeof THEME_PREVIEW_IDS];

export type ThemePreviewOption = {
  readonly description: string;
  readonly id: ThemePreview;
  readonly name: string;
};

const PREVIEW_LINE_SIZES = ["long", "medium", "short"] as const;

export function ThemePreviewCard({
  onSelect,
  option,
  selected,
}: {
  readonly onSelect: () => void;
  readonly option: ThemePreviewOption;
  readonly selected: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      aria-label={option.name}
      aria-pressed={selected}
      onClick={onSelect}
      className="sc-settings-theme-card"
    >
      <span
        aria-hidden="true"
        className="sc-settings-theme-preview-band"
        data-sidechat-theme-preview={option.id}
      >
        <span className="sc-settings-theme-preview-panel">
          <span className="sc-settings-theme-preview-lines">
            {PREVIEW_LINE_SIZES.map((size) => (
              <span key={size} className="sc-settings-theme-preview-line" data-size={size} />
            ))}
          </span>
          <span className="sc-settings-theme-preview-mark" />
        </span>
      </span>
      <span className="sc-settings-theme-copy">
        <span className="text-md font-semibold text-card-foreground">{option.name}</span>
        <span className="text-sm text-muted-foreground">{option.description}</span>
      </span>
    </button>
  );
}
