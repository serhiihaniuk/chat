/**
 * Component documentation app for the React migration of design_widget.html.
 *
 * A navigable docs site: a left rail lists every primitive and composition;
 * selecting one routes to its own page by URL hash, showing the live demo and the
 * token table extracted from the design spec. The toolbar drives the re-skin
 * contract live: theme, dark, corners, and density.
 */
import {
  Component,
  useEffect,
  useState,
  type CSSProperties,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from "react";

import { SideChatWidgetRoot, type ThemeName } from "#shared/ui/widget-root";

import { sections, type ShowcaseSection } from "../showcase-sections.js";
import { tokensForComponent } from "./design-tokens.js";

const THEMES: readonly ThemeName[] = ["graphite", "sapphire", "sage", "ocean"];
const CORNERS = [
  { id: "Sharp", value: "0rem" },
  { id: "Default", value: "0.625rem" },
  { id: "Rounded", value: "1rem" },
] as const;
const DENSITY = [
  { id: "Compact", value: "0.1875rem" },
  { id: "Cozy", value: "0.25rem" },
  { id: "Comfortable", value: "0.3125rem" },
] as const;

function readHashRoute(fallbackId: string): string {
  if (typeof window === "undefined") return fallbackId;
  return window.location.hash.replace(/^#/, "") || fallbackId;
}

function useHashRoute(fallbackId: string): readonly [string, (id: string) => void] {
  const [id, setId] = useState(() => readHashRoute(fallbackId));
  useEffect(() => {
    const onHash = (): void => setId(readHashRoute(fallbackId));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [fallbackId]);
  const navigate = (next: string): void => {
    window.location.hash = next;
    setId(next);
  };
  return [id, navigate];
}

export function DocsApp(): ReactElement {
  const [theme, setTheme] = useState<ThemeName>("graphite");
  const [dark, setDark] = useState(false);
  const [radius, setRadius] = useState<string>(CORNERS[1].value);
  const [density, setDensity] = useState<string>(DENSITY[1].value);

  const fallbackId = sections[0]?.id ?? "";
  const [activeId, navigate] = useHashRoute(fallbackId);
  const active = sections.find((section) => section.id === activeId) ?? sections[0];

  const primitives = sections.filter((section) => section.kind === "primitive");
  const compositions = sections.filter((section) => section.kind === "composition");
  const demoStyle = { "--radius": radius, "--space-unit": density } as CSSProperties;

  return (
    <div className={dark ? "dark" : undefined}>
      <div className="flex min-h-screen bg-background text-foreground">
        <aside className="sticky top-0 h-screen w-64 shrink-0 overflow-y-auto border-r border-border px-3 py-4">
          <div className="px-2 pb-3 text-sm font-semibold">Side Chat - Components</div>
          <NavGroup
            label="Primitives"
            items={primitives}
            activeId={activeId}
            onNavigate={navigate}
          />
          <NavGroup
            label="Compositions"
            items={compositions}
            activeId={activeId}
            onNavigate={navigate}
          />
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-border bg-background/90 px-6 py-3 backdrop-blur">
            <Segments
              label="Theme"
              options={THEMES.map((value) => ({ id: value, value }))}
              value={theme}
              onChange={(value) => setTheme(value as ThemeName)}
              capitalize
            />
            <button
              type="button"
              onClick={() => setDark((current) => !current)}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              {dark ? "Dark" : "Light"}
            </button>
            <Segments label="Corners" options={CORNERS} value={radius} onChange={setRadius} />
            <Segments label="Density" options={DENSITY} value={density} onChange={setDensity} />
          </header>

          {active ? (
            <DocPage key={active.id} section={active} theme={theme} demoStyle={demoStyle} />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function NavGroup({
  label,
  items,
  activeId,
  onNavigate,
}: {
  readonly label: string;
  readonly items: readonly ShowcaseSection[];
  readonly activeId: string;
  readonly onNavigate: (id: string) => void;
}): ReactElement {
  return (
    <nav className="mb-4 flex flex-col gap-0.5">
      <div className="px-2 pt-2 pb-1 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {items.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => onNavigate(section.id)}
          aria-current={section.id === activeId ? "page" : undefined}
          className="truncate rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent aria-[current=true]:bg-accent aria-[current=true]:text-foreground"
        >
          {section.title}
        </button>
      ))}
    </nav>
  );
}

function Segments<T extends { id: string; value: string }>({
  label,
  options,
  value,
  onChange,
  capitalize = false,
}: {
  readonly label: string;
  readonly options: readonly T[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly capitalize?: boolean;
}): ReactElement {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <span className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={option.value === value}
            className={`rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground aria-pressed:bg-accent aria-pressed:text-foreground${capitalize ? " capitalize" : ""}`}
          >
            {option.id}
          </button>
        ))}
      </span>
    </label>
  );
}

function DocPage({
  section,
  theme,
  demoStyle,
}: {
  readonly section: ShowcaseSection;
  readonly theme: ThemeName;
  readonly demoStyle: CSSProperties;
}): ReactElement {
  const tokens = tokensForComponent(section.id);
  return (
    <article className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{section.title}</h1>
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-2xs font-semibold capitalize text-muted-foreground">
          {section.kind}
        </span>
      </div>

      <section className="mt-6 flex flex-col gap-2">
        <h2 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          Live demo
        </h2>
        <div className="rounded-xl border border-border bg-card p-6">
          <SideChatWidgetRoot theme={theme} className="block" style={demoStyle}>
            <DemoBoundary id={section.id}>{section.node}</DemoBoundary>
          </SideChatWidgetRoot>
        </div>
      </section>

      {tokens.length > 0 ? (
        <section className="mt-8 flex flex-col gap-2">
          <h2 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Tokens ({tokens.length})
          </h2>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted text-2xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Token</th>
                  <th className="px-3 py-2 font-semibold">Resolves to</th>
                  <th className="px-3 py-2 font-semibold">CSS property</th>
                  <th className="px-3 py-2 font-semibold">Controls</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.token} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-mono text-xs text-foreground">{token.token}</td>
                    <td className="px-3 py-2 font-mono text-xs text-primary">{token.resolvesTo}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {token.property}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{token.controls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </article>
  );
}

/** Isolates a demo so one crashing component cannot blank the docs page. */
class DemoBoundary extends Component<{ id: string; children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[docs] demo "${this.props.id}" crashed:`, error, info.componentStack);
  }

  override render(): ReactNode {
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
