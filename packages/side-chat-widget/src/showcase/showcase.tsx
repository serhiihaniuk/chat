/**
 * Component showcase.
 *
 * The toolbar drives the re-skin acceptance test: swap theme, toggle host dark,
 * and scrub --radius. Sections render in the same order as design_widget.html.
 */
import { Component, useState, type CSSProperties, type ErrorInfo, type ReactNode } from "react";

import { SideChatWidgetRoot, type ThemeName } from "#shared/ui/widget-root";

import { sections } from "./showcase-sections.js";

const THEMES: readonly ThemeName[] = ["graphite", "sage", "ocean"];

export function ComponentShowcase() {
  const [theme, setTheme] = useState<ThemeName>("graphite");
  const [dark, setDark] = useState(false);
  const [radius, setRadius] = useState(0.625);

  return (
    <div className={dark ? "dark" : undefined}>
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-50 flex flex-wrap items-center gap-4 border-b border-border bg-background/90 px-6 py-3 backdrop-blur">
          <span className="text-sm font-semibold">Side Chat - Component Showcase</span>

          <div className="flex items-center gap-1 rounded-lg border border-border p-1">
            {THEMES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                aria-pressed={t === theme}
                className="rounded-md px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground aria-pressed:bg-accent aria-pressed:text-foreground"
              >
                {t}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
          >
            {dark ? "Dark" : "Light"}
          </button>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            radius {radius.toFixed(3)}rem
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.0625}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            />
          </label>

          <span className="ml-auto text-xs text-muted-foreground">
            {sections.length} components
          </span>
        </header>

        <SideChatWidgetRoot
          theme={theme}
          className="mx-auto block max-w-5xl px-6 py-10"
          style={{ "--radius": `${radius}rem` } as CSSProperties}
        >
          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Foundation ready. No components mounted yet.
            </p>
          ) : (
            <ShowcaseSections items={sections} />
          )}
        </SideChatWidgetRoot>
      </div>
    </div>
  );
}

function ShowcaseSections({ items }: { items: readonly (typeof sections)[number][] }) {
  return (
    <section className="flex flex-col gap-8">
      {items.map((s) => (
        <article key={s.id} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
          <div className="rounded-xl border border-border bg-card p-6">
            <SectionBoundary id={s.id}>{s.node}</SectionBoundary>
          </div>
        </article>
      ))}
    </section>
  );
}

/** Isolates each section so one crashing component cannot blank the whole showcase. */
class SectionBoundary extends Component<
  { id: string; children: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[showcase] section "${this.props.id}" crashed:`, error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="rounded-md border border-destructive bg-muted p-3">
          <p className="text-sm font-semibold text-foreground">Render error in "{this.props.id}"</p>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
