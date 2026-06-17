import { WIDGET_THEMES, type WidgetTheme, type WidgetThemeId } from "#entities/theme";
import { Button } from "#shared/ui/button";
import { ScrollArea } from "#shared/ui/scroll-area";
import { CheckIcon, ChevronLeftIcon } from "lucide-react";

// Full settings view that replaces the panel body. One section for now (Theme),
// laid out so density/radius/etc. sections can drop in later. Exposed-reasoning is a
// host/server option, not a user setting, so it does not appear here.
export const SettingsView = ({
  onBack,
  onSelectTheme,
  themeId,
}: {
  readonly onBack: () => void;
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
    <ScrollArea className="min-h-0 flex-1">
      <section
        aria-labelledby="settings-theme-heading"
        className="mx-auto max-w-[28rem] space-y-3 p-4"
      >
        <h4
          className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
          id="settings-theme-heading"
        >
          Theme
        </h4>
        <div className="space-y-2">
          {WIDGET_THEMES.map((theme) => (
            <ThemeCard
              isActive={theme.id === themeId}
              key={theme.id}
              onSelect={onSelectTheme}
              theme={theme}
            />
          ))}
        </div>
      </section>
    </ScrollArea>
  </div>
);

const ThemeCard = ({
  isActive,
  onSelect,
  theme,
}: {
  readonly isActive: boolean;
  readonly onSelect: (themeId: WidgetThemeId) => void;
  readonly theme: WidgetTheme;
}) => (
  <button
    aria-label={theme.name}
    aria-pressed={isActive}
    className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent aria-pressed:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    onClick={() => onSelect(theme.id)}
    type="button"
  >
    <ThemeSwatch themeId={theme.id} />
    <span className="min-w-0 flex-1">
      <span className="block font-medium text-foreground text-sm">{theme.name}</span>
      <span className="block truncate text-muted-foreground text-xs">{theme.description}</span>
    </span>
    {isActive && <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />}
  </button>
);

// A miniature palette preview. data-sidechat-theme-preview scopes this subtree to the
// previewed theme's tokens (see styles.css), so each swatch shows its own palette
// regardless of the active theme — fully tokenized, no inline styles.
const ThemeSwatch = ({ themeId }: { readonly themeId: WidgetThemeId }) => (
  <span
    className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-sc-canvas"
    data-sidechat-theme-preview={themeId}
  >
    <span className="flex w-6 flex-col gap-1 rounded-sm border border-border bg-card p-1">
      <span className="h-1 w-full rounded-full bg-foreground/70" />
      <span className="flex items-center gap-1">
        <span className="h-1 flex-1 rounded-full bg-muted-foreground/50" />
        <span className="size-1.5 shrink-0 rounded-full bg-primary" />
      </span>
    </span>
  </span>
);
