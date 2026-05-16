import {
  Copy,
  Maximize2,
  Minimize2,
  Settings,
  X,
} from "lucide-react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from "react";

import {
  appearancePresets,
  type AppearancePreset,
  type AppearancePresetId,
} from "../domain/appearance.js";
import { panelId } from "../domain/panel-geometry.js";

export type WidgetHeaderProps = {
  appearanceOpen: boolean;
  appearancePreset: AppearancePreset;
  isFullscreen: boolean;
  title?: string;
  onAppearanceToggle: () => void;
  onClose: () => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onFullscreenToggle: () => void;
  onResetAppearance: () => void;
  onSelectAppearance: (presetId: AppearancePresetId) => void;
};

export const WidgetHeader = ({
  appearanceOpen,
  appearancePreset,
  isFullscreen,
  title,
  onAppearanceToggle,
  onClose,
  onDragStart,
  onFullscreenToggle,
  onResetAppearance,
  onSelectAppearance,
}: WidgetHeaderProps) => (
  <header
    className={`flex shrink-0 touch-none select-none items-start justify-between gap-5 px-8 pt-8 pb-4 max-sm:px-4 max-sm:pt-5 ${
      isFullscreen
        ? "cursor-default"
        : "cursor-grab active:cursor-grabbing max-sm:cursor-default"
    }`}
    onPointerDown={onDragStart}
    style={{ background: "var(--sidechat-bg)" }}
  >
    <div className="min-w-0">
      <strong
        className="block text-2xl font-semibold tracking-tight max-sm:text-lg"
        style={{ color: "var(--sidechat-fg)" }}
      >
        {title ?? "Workspace Assistant"}
      </strong>
      <div className="mt-6 flex items-center gap-3 text-base text-slate-500 max-sm:mt-3 max-sm:text-sm">
        <Copy aria-hidden="true" className="size-5 shrink-0 text-slate-500" />
        <span>Using current page context</span>
        <span
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{ background: "var(--sidechat-accent)" }}
        />
      </div>
    </div>
    <div className="relative flex shrink-0 items-start gap-1">
      <button
        type="button"
        aria-expanded={appearanceOpen}
        aria-label="Customize assistant appearance"
        className="inline-flex size-14 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 focus:ring-2 focus:outline-none max-sm:size-11 [&_svg]:size-7 max-sm:[&_svg]:size-5"
        onClick={onAppearanceToggle}
        style={{ outlineColor: "var(--sidechat-accent)" }}
      >
        <Settings aria-hidden="true" />
      </button>
      {appearanceOpen ? (
        <AppearanceMenu
          appearancePreset={appearancePreset}
          onResetAppearance={onResetAppearance}
          onSelectAppearance={onSelectAppearance}
        />
      ) : null}
      <button
        type="button"
        aria-label={
          isFullscreen ? "Unfullscreen assistant" : "Fullscreen assistant"
        }
        aria-pressed={isFullscreen}
        className="inline-flex size-14 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 focus:ring-2 focus:outline-none max-sm:size-11 [&_svg]:size-7 max-sm:[&_svg]:size-5"
        onClick={onFullscreenToggle}
        style={{ outlineColor: "var(--sidechat-accent)" }}
        title={isFullscreen ? "Unfullscreen" : "Full screen"}
      >
        {isFullscreen ? (
          <Minimize2 aria-hidden="true" />
        ) : (
          <Maximize2 aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        aria-label="Close assistant"
        aria-expanded={true}
        aria-controls={panelId}
        className="inline-flex size-14 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 focus:ring-2 focus:ring-blue-500/20 focus:outline-none max-sm:size-11 [&_svg]:size-8 max-sm:[&_svg]:size-6"
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </button>
    </div>
  </header>
);

type AppearanceMenuProps = {
  appearancePreset: AppearancePreset;
  onResetAppearance: () => void;
  onSelectAppearance: (presetId: AppearancePresetId) => void;
};

const AppearanceMenu = ({
  appearancePreset,
  onResetAppearance,
  onSelectAppearance,
}: AppearanceMenuProps) => (
  <section
    aria-label="Appearance presets"
    className="absolute top-14 right-28 z-30 w-80 rounded-lg border bg-white p-4 text-base shadow-xl shadow-slate-950/15 max-sm:right-0 max-sm:w-[calc(100vw-3rem)]"
    style={{
      background: "var(--sidechat-bg)",
      borderColor: "var(--sidechat-border)",
      color: "var(--sidechat-fg)",
    }}
  >
    <div className="mb-3 flex items-center justify-between gap-3">
      <strong className="text-base">Appearance</strong>
      <button
        type="button"
        className="rounded border px-2.5 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus:ring-2 focus:outline-none"
        onClick={onResetAppearance}
        style={{
          borderColor: "var(--sidechat-border)",
          outlineColor: "var(--sidechat-accent)",
        }}
      >
        Reset
      </button>
    </div>
    <p className="mb-3 m-0 text-sm font-semibold uppercase tracking-wide text-slate-500">
      Presets only
    </p>
    <div className="space-y-2">
      {appearancePresets.map((preset) => {
        const selected = preset.id === appearancePreset.id;
        const background = selected ? "var(--sidechat-surface)" : "transparent";
        const borderColor = selected
          ? "var(--sidechat-accent)"
          : "var(--sidechat-border)";

        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={selected}
            className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition hover:bg-slate-50 focus:ring-2 focus:outline-none"
            onClick={() => onSelectAppearance(preset.id)}
            style={{
              background,
              borderColor,
              outlineColor: "var(--sidechat-accent)",
            }}
          >
            <span
              aria-hidden="true"
              className="size-5 rounded-full border"
              style={{
                background: preset.accent,
                borderColor: "var(--sidechat-border)",
              }}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{preset.label}</span>
              <span className="block text-sm text-slate-500">
                {preset.accent} accent
              </span>
            </span>
            <span className="flex shrink-0 gap-1">
              {[preset.background, preset.surface, preset.foreground].map(
                (color) => (
                  <Swatch color={color} key={color} />
                ),
              )}
            </span>
          </button>
        );
      })}
    </div>
  </section>
);

const Swatch = ({ color }: { color: string }) => (
  <span
    aria-hidden="true"
    className="size-4 rounded border"
    style={
      {
        background: color,
        borderColor: "var(--sidechat-border)",
      } satisfies CSSProperties
    }
  />
);
