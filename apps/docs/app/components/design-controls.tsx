/**
 * Theme configurator.
 *
 * One <DesignControls /> button toggles a docked sidebar whose knobs are all real widget
 * CSS tokens — `theme` -> data-sidechat-theme, `dark` -> a .dark class, per-token color
 * overrides -> inline `--<token>`, `radius` -> --radius, `density` -> --space-unit. The
 * context exposes `cssVars` for every <Preview> plus `resolvedColors`, which are measured
 * from the widget stylesheet so the sidebar shows the active theme instead of stale fallback
 * swatches. Editing any control re-skins the real components live. State persists to localStorage.
 */
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, RotateCcw, SlidersHorizontal, X } from "lucide-react";

import { ensureWidgetFontsInDocument, WIDGET_SHADOW_CSS } from "./widget-preview-css";

export type WidgetTheme = "graphite" | "sapphire" | "sage" | "ocean";

export interface DesignControlsState {
  theme: WidgetTheme;
  dark: boolean;
  radius: string;
  density: string;
  /** Per-token overrides keyed by tier-1 token base name (e.g. "primary", "sc-canvas"). */
  colors: Record<string, string>;
}

export interface DesignControlsContextValue extends DesignControlsState {
  setTheme: (theme: WidgetTheme) => void;
  setDark: (dark: boolean) => void;
  setRadius: (radius: string) => void;
  setDensity: (density: string) => void;
  setColor: (name: string, value: string) => void;
  clearColor: (name: string) => void;
  reset: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The CSS custom properties applied to every demo's widget root. */
  cssVars: Record<string, string>;
  /** Browser-resolved theme colors, normalized for the color pickers. */
  resolvedColors: Record<string, string>;
}

const THEMES: readonly { id: WidgetTheme; label: string; swatch: string }[] = [
  { id: "graphite", label: "Graphite", swatch: "#33373f" },
  { id: "sapphire", label: "Sapphire", swatch: "#34508f" },
  { id: "sage", label: "Sage", swatch: "#3f7a52" },
  { id: "ocean", label: "Ocean", swatch: "#3a6fc0" },
];

const PRIMARY_PRESETS: readonly { id: string; label: string; value: string | null }[] = [
  { id: "theme", label: "Theme", value: null },
  { id: "blue", label: "Blue", value: "#2f6fdb" },
  { id: "green", label: "Green", value: "#2a9d68" },
  { id: "violet", label: "Violet", value: "#6b46d9" },
  { id: "orange", label: "Orange", value: "#e06c1f" },
];

interface ColorToken {
  name: string;
  label: string;
  fallback: string;
}

const COLOR_GROUPS: readonly { group: string; tokens: readonly ColorToken[] }[] = [
  {
    group: "Surfaces",
    tokens: [
      { name: "background", label: "Background", fallback: "#fdfdfe" },
      { name: "card", label: "Card", fallback: "#ffffff" },
      { name: "popover", label: "Popover", fallback: "#ffffff" },
      { name: "muted", label: "Muted surface", fallback: "#f2f3f5" },
      { name: "accent", label: "Accent surface", fallback: "#eef0f3" },
      { name: "sidebar", label: "Sidebar", fallback: "#f7f8fb" },
      { name: "sc-canvas", label: "Canvas", fallback: "#f7f8fb" },
    ],
  },
  {
    group: "Text",
    tokens: [
      { name: "foreground", label: "Foreground", fallback: "#2c2f35" },
      { name: "muted-foreground", label: "Muted text", fallback: "#74787f" },
    ],
  },
  {
    group: "Borders & ring",
    tokens: [
      { name: "border", label: "Border / general dividers and cards", fallback: "#e3e5ea" },
      { name: "sidebar-border", label: "Rail / sidebar divider", fallback: "#e3e5ea" },
      { name: "input", label: "Input · fields & composer", fallback: "#e3e5ea" },
      { name: "ring", label: "Focus ring", fallback: "#757b86" },
    ],
  },
  {
    group: "Brand & status",
    tokens: [
      { name: "primary", label: "Primary", fallback: "#313640" },
      { name: "destructive", label: "Destructive", fallback: "#d83a2e" },
      { name: "success", label: "Success", fallback: "#1c9e6f" },
    ],
  },
];

const COLOR_TOKEN_NAMES = COLOR_GROUPS.flatMap((group) => group.tokens.map((token) => token.name));

const COLOR_FALLBACKS = COLOR_GROUPS.reduce<Record<string, string>>((fallbacks, group) => {
  for (const token of group.tokens) fallbacks[token.name] = token.fallback;
  return fallbacks;
}, {});

const RADIUS_PRESETS = ["0rem", "0.625rem", "1rem"];
const DENSITY_PRESETS = ["0.1875rem", "0.25rem", "0.3125rem"];

const DEFAULT_STATE: DesignControlsState = {
  theme: "graphite",
  dark: false,
  radius: "0.625rem",
  density: "0.25rem",
  colors: {},
};

const STORAGE_KEY = "side-chat-docs:design-controls";

const DesignControlsContext = createContext<DesignControlsContextValue | null>(null);

function normalizeHexColor(value: string): string | null {
  const hex = value.trim().toLowerCase();
  if (/^#[\da-f]{6}$/.test(hex)) return hex;
  const shortHex = /^#([\da-f])([\da-f])([\da-f])$/.exec(hex);
  if (!shortHex) return null;
  const [, r, g, b] = shortHex;
  if (!r || !g || !b) return null;
  return `#${r}${r}${g}${g}${b}${b}`;
}

function toHexByte(value: number): string {
  const finiteValue = Number.isFinite(value) ? value : 0;
  const channel = Math.round(Math.min(255, Math.max(0, finiteValue)));
  return channel.toString(16).padStart(2, "0");
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

function splitColorBody(value: string): string[] {
  const body = value.slice(value.indexOf("(") + 1, value.lastIndexOf(")"));
  return body.split("/")[0].replaceAll(",", " ").trim().split(/\s+/).filter(Boolean);
}

function parsePercentOrNumber(value: string, percentScale: number): number {
  if (value.endsWith("%")) return (Number.parseFloat(value) / 100) * percentScale;
  return Number.parseFloat(value);
}

function parseRgbColor(value: string): string | null {
  const [r, g, b] = splitColorBody(value);
  if (r === undefined || g === undefined || b === undefined) return null;
  return rgbToHex(
    parsePercentOrNumber(r, 255),
    parsePercentOrNumber(g, 255),
    parsePercentOrNumber(b, 255),
  );
}

function parseSrgbColor(value: string): string | null {
  const [, r, g, b] = splitColorBody(value);
  if (r === undefined || g === undefined || b === undefined) return null;
  return rgbToHex(
    parsePercentOrNumber(r, 1) * 255,
    parsePercentOrNumber(g, 1) * 255,
    parsePercentOrNumber(b, 1) * 255,
  );
}

function linearToSrgb(value: number): number {
  if (value <= 0.0031308) return 12.92 * value;
  return 1.055 * value ** (1 / 2.4) - 0.055;
}

function parseOklchColor(value: string): string | null {
  const [lightness, chroma, hue] = splitColorBody(value);
  if (lightness === undefined || chroma === undefined || hue === undefined) return null;

  const l = parsePercentOrNumber(lightness, 1);
  const c = Number.parseFloat(chroma);
  const h = (Number.parseFloat(hue) * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = lPrime ** 3;
  const m3 = mPrime ** 3;
  const s3 = sPrime ** 3;

  const r = linearToSrgb(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3);
  const g = linearToSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3);
  const blue = linearToSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3);

  return rgbToHex(r * 255, g * 255, blue * 255);
}

function cssColorToHex(value: string): string | null {
  const color = value.trim().toLowerCase();
  if (color.startsWith("#")) return normalizeHexColor(color);
  if (color.startsWith("rgb(") || color.startsWith("rgba(")) return parseRgbColor(color);
  if (color.startsWith("color(srgb")) return parseSrgbColor(color);
  if (color.startsWith("oklch(")) return parseOklchColor(color);
  return null;
}

function createThemeProbe(state: DesignControlsState, cssVars: Record<string, string>) {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;";

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = WIDGET_SHADOW_CSS;

  const root = document.createElement("div");
  root.className = state.dark ? "side-chat-widget-root dark" : "side-chat-widget-root";
  if (state.theme !== "graphite") root.dataset["sidechatTheme"] = state.theme;
  for (const [name, value] of Object.entries(cssVars)) root.style.setProperty(name, value);

  const sample = document.createElement("div");
  root.appendChild(sample);
  shadow.append(style, root);
  document.body.appendChild(host);

  return { host, sample };
}

function resolveThemeColors(
  state: DesignControlsState,
  cssVars: Record<string, string>,
): Record<string, string> {
  if (typeof document === "undefined") return COLOR_FALLBACKS;
  ensureWidgetFontsInDocument();

  const { host, sample } = createThemeProbe(state, cssVars);
  try {
    const next: Record<string, string> = {};
    for (const name of COLOR_TOKEN_NAMES) {
      sample.style.backgroundColor = `var(--${name})`;
      const resolved = getComputedStyle(sample).backgroundColor;
      next[name] =
        cssColorToHex(resolved) ?? state.colors[name] ?? COLOR_FALLBACKS[name] ?? "#000000";
    }
    return next;
  } finally {
    host.remove();
  }
}

function readStored(): DesignControlsState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<DesignControlsState>) };
  } catch {
    return DEFAULT_STATE;
  }
}

export function DesignControlsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DesignControlsState>(DEFAULT_STATE);
  const [open, setOpen] = useState(false);
  const [resolvedColors, setResolvedColors] = useState<Record<string, string>>(COLOR_FALLBACKS);

  useEffect(() => {
    setState(readStored());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota / privacy-mode failures
    }
  }, [state]);

  const cssVars = useMemo(() => {
    const vars: Record<string, string> = {
      "--radius": state.radius,
      "--space-unit": state.density,
    };
    for (const [name, value] of Object.entries(state.colors)) vars[`--${name}`] = value;
    return vars;
  }, [state]);

  useEffect(() => {
    setResolvedColors(resolveThemeColors(state, cssVars));
  }, [state, cssVars]);

  const value = useMemo<DesignControlsContextValue>(
    () => ({
      ...state,
      cssVars,
      resolvedColors,
      open,
      setOpen,
      setTheme: (theme) => setState((s) => ({ ...s, theme })),
      setDark: (dark) => setState((s) => ({ ...s, dark })),
      setRadius: (radius) => setState((s) => ({ ...s, radius })),
      setDensity: (density) => setState((s) => ({ ...s, density })),
      setColor: (name, val) => setState((s) => ({ ...s, colors: { ...s.colors, [name]: val } })),
      clearColor: (name) =>
        setState((s) => {
          const next = { ...s.colors };
          delete next[name];
          return { ...s, colors: next };
        }),
      reset: () => setState(DEFAULT_STATE),
    }),
    [state, cssVars, resolvedColors, open],
  );

  return (
    <DesignControlsContext value={value}>
      <div
        className={`theme-controls-layout${open ? " theme-controls-layout--open" : ""}`}
        data-theme-controls-open={open ? "true" : "false"}
      >
        <div className="theme-controls-content">{children}</div>
        <ThemeComposer />
      </div>
    </DesignControlsContext>
  );
}

export function useDesignControls(): DesignControlsContextValue {
  const ctx = use(DesignControlsContext);
  if (!ctx) {
    throw new Error("useDesignControls must be used within <DesignControlsProvider>");
  }
  return ctx;
}

/** The trigger — drop `<DesignControls />` onto any docs page with demos. */
export function DesignControls() {
  const { theme, colors, resolvedColors, open, setOpen } = useDesignControls();
  const dot =
    colors["primary"] ??
    resolvedColors["primary"] ??
    (THEMES.find((t) => t.id === theme) ?? THEMES[0]).swatch;

  return (
    <button
      type="button"
      aria-controls="theme-configurator"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className="not-prose my-4 inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-card px-3 py-1.5 text-sm font-medium text-fd-foreground shadow-sm transition-colors hover:bg-fd-accent aria-expanded:bg-fd-accent"
    >
      <SlidersHorizontal className="size-4 text-fd-muted-foreground" />
      Customize theme
      <span
        className="size-3.5 rounded-full ring-1 ring-fd-border"
        style={{ background: dot }}
        aria-hidden
      />
    </button>
  );
}

const SLIDER_CLASS =
  "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-fd-border outline-none [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-fd-primary [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-fd-primary";

const SWATCH_BTN =
  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors border-fd-border text-fd-muted-foreground hover:text-fd-foreground aria-pressed:border-fd-primary/60 aria-pressed:bg-fd-primary/10 aria-pressed:text-fd-foreground";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-xs font-semibold text-fd-foreground">{title}</h3>
      {children}
    </section>
  );
}

function SwatchPills<T>({
  options,
  isActive,
  onPick,
}: {
  options: readonly { id: string; label: string; swatch?: string; value: T }[];
  isActive: (value: T) => boolean;
  onPick: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = isActive(o.value);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(o.value)}
            className={SWATCH_BTN}
          >
            {o.swatch !== undefined ? (
              <span
                className="flex size-3.5 items-center justify-center rounded-full ring-1 ring-fd-border"
                style={{ background: o.swatch }}
              >
                {active ? <Check className="size-2.5 text-white drop-shadow" /> : null}
              </span>
            ) : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  presets,
  display,
  onChange,
}: {
  value: string;
  min: number;
  max: number;
  step: number;
  presets: readonly string[];
  display: (rem: number) => string;
  onChange: (cssValue: string) => void;
}) {
  const rem = Number.parseFloat(value) || 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={rem}
          onChange={(e) => onChange(`${e.target.value}rem`)}
          className={SLIDER_CLASS}
        />
        <code className="w-14 shrink-0 text-right text-xs text-fd-muted-foreground">
          {display(rem)}
        </code>
      </div>
      <div className="flex gap-1">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={value === p}
            onClick={() => onChange(p)}
            className="rounded-md border border-transparent px-1.5 py-0.5 text-2xs font-medium text-fd-muted-foreground transition-colors hover:text-fd-foreground aria-pressed:border-fd-border aria-pressed:bg-fd-accent aria-pressed:text-fd-foreground"
          >
            {display(Number.parseFloat(p))}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorRow({ name, label, fallback }: { name: string; label: string; fallback: string }) {
  const { colors, resolvedColors, setColor, clearColor } = useDesignControls();
  const overridden = name in colors;
  const resolved = resolvedColors[name] ?? fallback;
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="color"
        aria-label={label}
        value={colors[name] ?? resolved}
        onChange={(e) => setColor(name, e.target.value)}
        className="size-7 shrink-0 cursor-pointer appearance-none rounded-md border border-fd-border bg-transparent p-0.5 [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
      />
      <span className="flex-1 text-sm text-fd-foreground">{label}</span>
      <code className="text-2xs text-fd-muted-foreground">--{name}</code>
      {overridden ? (
        <button
          type="button"
          aria-label={`Reset ${label}`}
          onClick={() => clearColor(name)}
          className="rounded p-0.5 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
        >
          <X className="size-3.5" />
        </button>
      ) : (
        <code className="text-2xs text-fd-muted-foreground/70">{resolved}</code>
      )}
    </div>
  );
}

function ThemeComposer() {
  const c = useDesignControls();
  const { open, setOpen } = c;
  const overrideCount = Object.keys(c.colors).length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <aside
      id="theme-configurator"
      className="theme-controls-sidebar flex w-full flex-col border-t border-fd-border bg-fd-background text-fd-foreground lg:border-l lg:border-t-0"
    >
      <header className="flex items-center justify-between border-b border-fd-border px-4 py-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-fd-muted-foreground" />
          <span className="text-sm font-semibold">Theme configurator</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={c.reset}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
          >
            <RotateCcw className="size-3" />
            Reset
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={() => c.setOpen(false)}
            className="rounded-md p-1 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <Section title="Theme">
          <SwatchPills
            options={THEMES.map((t) => ({
              id: t.id,
              label: t.label,
              swatch: t.swatch,
              value: t.id,
            }))}
            isActive={(v) => v === c.theme}
            onPick={c.setTheme}
          />
        </Section>

        <Section title="Mode">
          <SwatchPills
            options={[
              { id: "light", label: "Light", value: false },
              { id: "dark", label: "Dark", value: true },
            ]}
            isActive={(v) => v === c.dark}
            onPick={c.setDark}
          />
          {c.theme !== "graphite" && c.dark ? (
            <span className="text-2xs text-fd-muted-foreground">
              Named themes are light-only — dark applies to Graphite.
            </span>
          ) : null}
        </Section>

        <Section title="Primary">
          <SwatchPills
            options={PRIMARY_PRESETS.map((p) => ({
              id: p.id,
              label: p.label,
              swatch:
                p.value ??
                c.resolvedColors["primary"] ??
                (THEMES.find((t) => t.id === c.theme) ?? THEMES[0]).swatch,
              value: p.value,
            }))}
            isActive={(v) => (v ?? null) === (c.colors["primary"] ?? null)}
            onPick={(v) => (v === null ? c.clearColor("primary") : c.setColor("primary", v))}
          />
        </Section>

        <Section title={`Colors${overrideCount ? ` · ${overrideCount} overridden` : ""}`}>
          <div className="flex flex-col gap-3.5 rounded-xl border border-fd-border bg-fd-card p-3">
            {COLOR_GROUPS.map((g) => (
              <div key={g.group} className="flex flex-col gap-2">
                <span className="text-2xs font-semibold uppercase tracking-wide text-fd-muted-foreground/80">
                  {g.group}
                </span>
                {g.tokens.map((t) => (
                  <ColorRow key={t.name} name={t.name} label={t.label} fallback={t.fallback} />
                ))}
              </div>
            ))}
          </div>
          <span className="text-2xs leading-relaxed text-fd-muted-foreground">
            <b>--border</b> covers general dividers and cards; <b>--sidebar-border</b> covers the
            rail seam; <b>--input</b> is the separate field &amp; composer border. Overrides layer
            on the active theme; resolved values shown on the right are browser-normalized. ✕
            resets.
          </span>
        </Section>

        <Section title="Corner radius · --radius">
          <Slider
            value={c.radius}
            min={0}
            max={1.5}
            step={0.0625}
            presets={RADIUS_PRESETS}
            display={(rem) => `${Math.round(rem * 16)}px`}
            onChange={c.setRadius}
          />
        </Section>

        <Section title="Density · --space-unit">
          <Slider
            value={c.density}
            min={0.15}
            max={0.4}
            step={0.0125}
            presets={DENSITY_PRESETS}
            display={(rem) => `${rem.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}rem`}
            onChange={c.setDensity}
          />
        </Section>

        <Section title="Resolved tokens">
          <pre className="overflow-x-auto rounded-xl border border-fd-border bg-fd-card p-3 font-mono text-2xs leading-relaxed text-fd-muted-foreground">
            {COLOR_TOKEN_NAMES.map(
              (name) => `--${name}: ${c.resolvedColors[name] ?? "pending"};`,
            ).join("\n")}
            {"\n"}
            {Object.entries(c.cssVars)
              .filter(([name]) => name === "--radius" || name === "--space-unit")
              .map(([k, v]) => `${k}: ${v};`)
              .join("\n")}
            {c.theme !== "graphite" ? `\ndata-sidechat-theme: ${c.theme};` : ""}
            {c.dark ? `\nclass: dark;` : ""}
          </pre>
        </Section>
      </div>
    </aside>
  );
}
