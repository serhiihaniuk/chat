/**
 * Settings (responsive).
 *
 * One group state drives both navigators and the same Tabs.Panel set. Wide uses a
 * left rail; narrow keeps Tabs.Root mounted but swaps the navigator to a top
 * Select. Theme rows, accent swatches, field shells, and panel spacing follow the
 * design_widget.html Settings source before any live measurement.
 */
import { useState, type ReactElement, type ReactNode } from "react";

import { Field } from "@base-ui/react/field";
import { Select } from "@base-ui/react/select";
import { Tabs } from "@base-ui/react/tabs";
import {
  Check,
  ChevronDown,
  Menu,
  Palette,
  Settings as SettingsIcon,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "#shared/lib/cn";
import { ScrollArea } from "#shared/ui/scroll-area";
import { Segmented, type SegmentedItem } from "#shared/ui/segmented";
import { Switch } from "#shared/ui/switch";
import { usePortalContainer } from "#shared/ui/widget-root";

type ThemePreview = "graphite" | "sage" | "ocean" | "dark";

type ThemeOption = {
  id: ThemePreview;
  name: string;
  description: string;
};

const THEMES: readonly ThemeOption[] = [
  { id: "graphite", name: "Graphite", description: "Neutral grayscale" },
  { id: "sage", name: "Sage", description: "Green-tinted" },
  { id: "ocean", name: "Ocean", description: "Blue-tinted" },
  { id: "dark", name: "Dark", description: "Graphite, inverted" },
];

type AccentOption = {
  id: "default" | "blue" | "green" | "violet" | "orange";
  label: string;
};

const ACCENTS: readonly AccentOption[] = [
  { id: "default", label: "Default" },
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
  { id: "violet", label: "Violet" },
  { id: "orange", label: "Orange" },
];

type ModelOption = { id: string; name: string };

const DEFAULT_MODEL: ModelOption = { id: "default", name: "Default assistant" };

const MODELS: readonly ModelOption[] = [
  DEFAULT_MODEL,
  { id: "code", name: "Code helper" },
  { id: "research", name: "Researcher" },
];

const CORNER_ITEMS: readonly SegmentedItem[] = [
  { id: "sharp", label: "Sharp" },
  { id: "default", label: "Default" },
  { id: "rounded", label: "Rounded" },
];

const DENSITY_ITEMS: readonly SegmentedItem[] = [
  { id: "compact", label: "Compact" },
  { id: "cozy", label: "Cozy" },
  { id: "roomy", label: "Roomy" },
];

const TAB_CLASS =
  "flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent text-left text-sm font-medium text-(--settings-item-fg) selected:bg-(--settings-item-active-bg) px-(--settings-item-px) py-(--settings-item-py) rounded-(--settings-item-radius)";

const SETTINGS_LABEL_CLASS =
  "text-(length:--settings-label-size) font-semibold text-(--settings-label-fg)";

const SETTINGS_HINT_CLASS = "text-xs text-(--settings-hint-fg)";

function ThemeSwatch({
  option,
  selected,
  onSelect,
}: {
  option: ThemeOption;
  selected: boolean;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className="sc-settings-theme-card"
    >
      <span className="sc-settings-theme-chip" data-theme={option.id} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-sm font-medium text-card-foreground">{option.name}</span>
        <span className="text-xs text-muted-foreground">{option.description}</span>
      </span>
      {selected ? (
        <span className="inline-flex shrink-0 text-primary">
          <Check className="size-4" strokeWidth={2.4} />
        </span>
      ) : null}
    </button>
  );
}

function AccentSwatches({
  accent,
  onAccentChange,
}: {
  accent: AccentOption["id"];
  onAccentChange: (next: AccentOption["id"]) => void;
}): ReactElement {
  return (
    <div className="mt-2 flex gap-2">
      {ACCENTS.map((option) => (
        <button
          key={option.id}
          type="button"
          title={option.label}
          aria-label={option.label}
          aria-pressed={accent === option.id}
          data-accent={option.id}
          onClick={() => onAccentChange(option.id)}
          className="sc-settings-accent-swatch"
        />
      ))}
    </div>
  );
}

function ThemeGroup({
  theme,
  onThemeChange,
  accent,
  onAccentChange,
  corners,
  onCornersChange,
  density,
  onDensityChange,
  narrow,
}: {
  theme: ThemePreview;
  onThemeChange: (next: ThemePreview) => void;
  accent: AccentOption["id"];
  onAccentChange: (next: AccentOption["id"]) => void;
  corners: string;
  onCornersChange: (next: string) => void;
  density: string;
  onDensityChange: (next: string) => void;
  narrow: boolean;
}): ReactElement {
  return (
    <div className={cn("flex flex-col", narrow ? "gap-4" : "gap-4.5")}>
      <div>
        {narrow ? null : <div className={SETTINGS_LABEL_CLASS}>Theme</div>}
        <div className="sc-settings-theme-list" data-wide={narrow ? undefined : "true"}>
          {THEMES.map((option) => (
            <ThemeSwatch
              key={option.id}
              option={option}
              selected={theme === option.id}
              onSelect={() => onThemeChange(option.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <div className={SETTINGS_LABEL_CLASS}>Accent</div>
        <AccentSwatches accent={accent} onAccentChange={onAccentChange} />
      </div>

      <div>
        <div className={SETTINGS_LABEL_CLASS}>Corners</div>
        <Segmented
          items={[...CORNER_ITEMS]}
          value={corners}
          onValueChange={onCornersChange}
          className="mt-2"
        />
      </div>

      <div>
        <div className={SETTINGS_LABEL_CLASS}>Density</div>
        <Segmented
          items={[...DENSITY_ITEMS]}
          value={density}
          onValueChange={onDensityChange}
          className="mt-2"
        />
      </div>
    </div>
  );
}

function GeneralGroup({
  instructions,
  onInstructionsChange,
  sendOnEnter,
  onSendOnEnterChange,
  model,
  onModelChange,
  narrow,
}: {
  instructions: string;
  onInstructionsChange: (v: string) => void;
  sendOnEnter: boolean;
  onSendOnEnterChange: (v: boolean) => void;
  model: ModelOption;
  onModelChange: (v: ModelOption) => void;
  narrow: boolean;
}): ReactElement {
  const container = usePortalContainer();

  return (
    <div className={cn("flex flex-col", narrow ? "gap-4" : "gap-4.5")}>
      <Field.Root>
        <Field.Label className={SETTINGS_LABEL_CLASS}>Custom instructions</Field.Label>
        <Field.Description className={cn(SETTINGS_HINT_CLASS, "mt-1 leading-normal")}>
          Prepended to every conversation as the system prompt.
        </Field.Description>
        <Field.Control
          value={instructions}
          onValueChange={onInstructionsChange}
          placeholder="You are a concise assistant for our workspace..."
          render={<textarea rows={4} data-narrow={narrow ? "true" : undefined} />}
          className="sc-settings-textarea"
        />
      </Field.Root>

      <Field.Root>
        <Field.Label className="sc-settings-switch-row">
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="text-(length:--settings-label-size) font-medium text-(--settings-label-fg)">
              Send on Enter
            </span>
            <span className={SETTINGS_HINT_CLASS}>
              {narrow ? "Shift+Enter -> newline" : "Shift+Enter inserts a newline"}
            </span>
          </span>
          <Switch checked={sendOnEnter} onCheckedChange={onSendOnEnterChange} />
        </Field.Label>
      </Field.Root>

      <div>
        <div className={cn(SETTINGS_LABEL_CLASS, "mb-2")}>Default model</div>
        <Select.Root
          items={MODELS.map((m) => ({ label: m.name, value: m }))}
          value={model}
          onValueChange={(value) => value && onModelChange(value)}
          itemToStringLabel={(m: ModelOption) => m.name}
          isItemEqualToValue={(a: ModelOption, b: ModelOption) => a?.id === b?.id}
        >
          <Select.Trigger className="sc-settings-select-trigger justify-between">
            <Select.Value className="text-sm text-foreground" />
            <Select.Icon className="inline-flex text-muted-foreground">
              <ChevronDown className="size-3.5" />
            </Select.Icon>
          </Select.Trigger>

          <Select.Portal container={container}>
            <Select.Positioner sideOffset={6}>
              <Select.Popup data-slot="select-content">
                <Select.List>
                  {MODELS.map((m) => (
                    <Select.Item key={m.id} value={m} className="sc-settings-menu-row">
                      <Select.ItemText className="flex-1 text-sm text-foreground">
                        {m.name}
                      </Select.ItemText>
                      <Select.ItemIndicator className="inline-flex shrink-0 text-primary">
                        <Check className="size-3.5" strokeWidth={2.4} />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.List>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </div>
    </div>
  );
}

type Group = {
  id: string;
  label: string;
  Icon: LucideIcon;
  render: (narrow: boolean) => ReactNode;
};

export function SettingsPanel({ wide = true }: { wide?: boolean }): ReactElement {
  const container = usePortalContainer();
  const [group, setGroup] = useState("theme");
  const [theme, setTheme] = useState<ThemePreview>("graphite");
  const [accent, setAccent] = useState<AccentOption["id"]>("default");
  const [corners, setCorners] = useState("default");
  const [density, setDensity] = useState("cozy");
  const [instructions, setInstructions] = useState("");
  const [sendOnEnter, setSendOnEnter] = useState(true);
  const [model, setModel] = useState<ModelOption>(DEFAULT_MODEL);

  const groups: Group[] = [
    {
      id: "theme",
      label: "Theme",
      Icon: Palette,
      render: (narrow) => (
        <ThemeGroup
          theme={theme}
          onThemeChange={setTheme}
          accent={accent}
          onAccentChange={setAccent}
          corners={corners}
          onCornersChange={setCorners}
          density={density}
          onDensityChange={setDensity}
          narrow={narrow}
        />
      ),
    },
    {
      id: "general",
      label: "General",
      Icon: SettingsIcon,
      render: (narrow) => (
        <GeneralGroup
          instructions={instructions}
          onInstructionsChange={setInstructions}
          sendOnEnter={sendOnEnter}
          onSendOnEnterChange={setSendOnEnter}
          model={model}
          onModelChange={setModel}
          narrow={narrow}
        />
      ),
    },
  ];

  const active = groups.find((g) => g.id === group) ?? groups[0];

  return (
    <Tabs.Root
      value={group}
      onValueChange={(next) => setGroup(next as string)}
      className={cn("min-h-0 flex-1 overflow-hidden", wide ? "flex" : "flex flex-col p-3")}
    >
      {wide ? (
        <Tabs.List className="flex w-(--settings-nav-w) shrink-0 flex-col gap-0.5 border-r border-(--settings-nav-border) bg-(--settings-nav-bg) px-2 py-2.5">
          {groups.map((g) => (
            <Tabs.Tab key={g.id} value={g.id} className={TAB_CLASS}>
              <g.Icon className="shrink-0 text-muted-foreground" size={15} strokeWidth={1.8} />
              <span className="truncate">{g.label}</span>
            </Tabs.Tab>
          ))}
        </Tabs.List>
      ) : (
        <Select.Root
          items={groups.map((g) => ({ label: g.label, value: g }))}
          value={active}
          onValueChange={(next) => next && setGroup(next.id)}
          itemToStringLabel={(g: Group) => g.label}
          isItemEqualToValue={(a: Group, b: Group) => a?.id === b?.id}
        >
          <Select.Trigger className="sc-settings-select-trigger flex-none">
            <Menu className="shrink-0 text-muted-foreground" size={15} strokeWidth={1.8} />
            <Select.Value className="flex-1 text-left text-sm font-medium text-foreground" />
            <Select.Icon className="inline-flex text-muted-foreground">
              <ChevronDown className="size-3.5" />
            </Select.Icon>
          </Select.Trigger>

          <Select.Portal container={container}>
            <Select.Positioner sideOffset={5}>
              <Select.Popup data-slot="select-content">
                <Select.List>
                  {groups.map((g) => (
                    <Select.Item key={g.id} value={g} className="sc-settings-menu-row">
                      <g.Icon className="shrink-0 text-(--media-fg)" size={15} strokeWidth={1.8} />
                      <Select.ItemText className="min-w-0 flex-1 text-sm text-foreground">
                        {g.label}
                      </Select.ItemText>
                      <Select.ItemIndicator className="inline-flex shrink-0 text-primary">
                        <Check className="size-3.5" strokeWidth={2.4} />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.List>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      )}

      {groups.map((g) => (
        <Tabs.Panel
          key={g.id}
          value={g.id}
          className={cn("min-w-0 flex-1", wide ? "relative" : "relative mt-3")}
        >
          <ScrollArea className={cn("absolute inset-0", wide ? "p-(--settings-content-pad)" : "")}>
            {g.render(!wide)}
          </ScrollArea>
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}

function SettingsFrame({ wide, className }: { wide: boolean; className?: string }): ReactElement {
  return (
    <div className={cn("sc-settings-frame", className)}>
      <div className="sc-settings-header">
        <span className="sc-settings-header-icon">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </span>
        <span className="sc-settings-header-title">Settings</span>
        <span className="sc-settings-header-icon">
          <X size={18} strokeWidth={1.8} />
        </span>
      </div>
      <SettingsPanel wide={wide} />
    </div>
  );
}

export function SettingsSection(): ReactElement {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="rounded-xl border border-border bg-muted/40 p-6">
        <SettingsFrame wide className="sc-settings-frame-wide" />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-none">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Narrow - panel &lt; 420px
          </div>
          <SettingsFrame wide={false} className="sc-settings-frame-narrow" />
        </div>
      </div>
    </div>
  );
}
