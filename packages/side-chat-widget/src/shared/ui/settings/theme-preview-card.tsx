import type { ReactElement } from "react";

import type { WidgetTheme, WidgetThemeId } from "#shared/lib/widget-themes";

// Aliases of the canonical theme types (see `shared/lib/widget-themes`); the local
// `shared/ui` names stay for the settings surface, but the id union and option shape
// have exactly one definition.
export type ThemePreview = WidgetThemeId;
export type ThemePreviewOption = WidgetTheme;

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
