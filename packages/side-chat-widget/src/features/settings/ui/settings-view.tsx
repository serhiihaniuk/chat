import { isWidgetThemeId, WIDGET_THEME_IDS, type WidgetThemeId } from "#entities/theme";
import { useWidgetLabels } from "#shared/lib/widget-labels";
import { Button } from "#shared/ui/button";
import { SettingsPanel } from "#shared/ui/settings";
import type { AccentOption } from "#shared/ui/settings-groups";
import { ChevronLeftIcon } from "lucide-react";

// Settings is an in-panel view, not a new floating frame: it borrows the chat
// shell's sidebar/header rhythm while keeping appearance ownership in features/theme.
export const SettingsView = ({
  accent,
  corners,
  density,
  elevation,
  onAccentChange,
  onBack,
  onCornersChange,
  onDensityChange,
  onElevationChange,
  onSelectTheme,
  onSendWithCtrlEnterChange,
  onTextSizeChange,
  onToolDetailChange,
  onTypefaceChange,
  sendWithCtrlEnter,
  textSize,
  themeId,
  toolDetail,
  typeface,
}: {
  readonly accent: AccentOption["id"];
  readonly corners: string;
  readonly density: string;
  readonly elevation: string;
  readonly onAccentChange: (next: string) => void;
  readonly onBack: () => void;
  readonly onCornersChange: (next: string) => void;
  readonly onDensityChange: (next: string) => void;
  readonly onElevationChange: (next: string) => void;
  readonly onSelectTheme: (themeId: WidgetThemeId) => void;
  readonly onSendWithCtrlEnterChange: (next: boolean) => void;
  readonly onTextSizeChange: (next: string) => void;
  readonly onToolDetailChange: (next: string) => void;
  readonly onTypefaceChange: (next: string) => void;
  readonly sendWithCtrlEnter: boolean;
  readonly textSize: string;
  readonly themeId: WidgetThemeId;
  readonly toolDetail: string;
  readonly typeface: string;
}) => (
  <SettingsPanel
    accent={accent}
    applyAppearance={false}
    corners={corners}
    density={density}
    elevation={elevation}
    header={<SettingsHeader onBack={onBack} />}
    onAccentChange={onAccentChange}
    onCornersChange={onCornersChange}
    onDensityChange={onDensityChange}
    onElevationChange={onElevationChange}
    onSendWithCtrlEnterChange={onSendWithCtrlEnterChange}
    onTextSizeChange={onTextSizeChange}
    onThemeChange={(next) => {
      if (isWidgetThemeId(next)) onSelectTheme(next);
    }}
    onToolDetailChange={onToolDetailChange}
    onTypefaceChange={onTypefaceChange}
    railHeader={<SettingsRailHeader onBack={onBack} />}
    sendWithCtrlEnter={sendWithCtrlEnter}
    textSize={textSize}
    theme={themeId}
    themeOptions={WIDGET_THEME_IDS}
    toolDetail={toolDetail}
    typeface={typeface}
  />
);

const SettingsHeader = ({ onBack }: { readonly onBack: () => void }) => {
  const labels = useWidgetLabels();
  return (
    <header className="sc-header">
      <div className="flex min-w-0 items-center gap-2">
        <span className="sc-narrow-slot">
          <Button
            aria-label={labels.headerBack}
            onClick={onBack}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
        </span>
        <h3 className="truncate text-md font-semibold text-foreground">
          {labels.headerSettingsTitle}
        </h3>
      </div>
    </header>
  );
};

const SettingsRailHeader = ({ onBack }: { readonly onBack: () => void }) => {
  const labels = useWidgetLabels();
  return (
    <div className="sc-rail-newchat border-b border-(--settings-nav-border)">
      <Button
        aria-label={labels.headerBack}
        className="w-full justify-start gap-2 px-2.5 py-2 text-left"
        onClick={onBack}
        type="button"
        variant="secondary"
      >
        <ChevronLeftIcon className="size-4 text-primary" />
        {labels.headerBack}
      </Button>
    </div>
  );
};
