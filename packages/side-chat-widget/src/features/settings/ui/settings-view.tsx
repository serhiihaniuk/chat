import { isWidgetThemeId, WIDGET_THEME_IDS, type WidgetThemeId } from "#entities/theme";
import { Button } from "#shared/ui/button";
import { SettingsPanel } from "#shared/ui/settings";
import type { AccentOption } from "#shared/ui/settings-groups";
import { ChevronLeftIcon } from "lucide-react";

// Full-panel settings uses the shared SettingsPanel but keeps ownership of widget
// appearance in features/theme. The overlay sits inside .sc-widget-panel, so the
// wide/narrow settings nav follows the same container query as the chat sidebar.
export const SettingsView = ({
  accent,
  corners,
  density,
  onAccentChange,
  onBack,
  onCornersChange,
  onDensityChange,
  onSelectTheme,
  themeId,
}: {
  readonly accent: AccentOption["id"];
  readonly corners: string;
  readonly density: string;
  readonly onAccentChange: (next: string) => void;
  readonly onBack: () => void;
  readonly onCornersChange: (next: string) => void;
  readonly onDensityChange: (next: string) => void;
  readonly onSelectTheme: (themeId: WidgetThemeId) => void;
  readonly themeId: WidgetThemeId;
}) => (
  <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
      <Button aria-label="Back" onClick={onBack} size="icon-sm" type="button" variant="ghost">
        <ChevronLeftIcon className="size-4" />
      </Button>
      <h3 className="font-medium text-sm">Settings</h3>
    </div>
    <SettingsPanel
      accent={accent}
      applyAppearance={false}
      corners={corners}
      density={density}
      onAccentChange={onAccentChange}
      onCornersChange={onCornersChange}
      onDensityChange={onDensityChange}
      onThemeChange={(next) => {
        if (isWidgetThemeId(next)) onSelectTheme(next);
      }}
      theme={themeId}
      themeOptions={WIDGET_THEME_IDS}
    />
  </div>
);
