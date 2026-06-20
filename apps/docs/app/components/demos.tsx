/**
 * Hand-authored demos for the docs, composed from the REAL widget primitives.
 *
 * These render inside <Preview>'s shadow root, which is styled ONLY by the widget's
 * compiled stylesheet — i.e. only the Tailwind utilities the widget itself uses. So
 * demo-level layout/labels use inline styles + widget design tokens (var(--…)) and
 * lucide's `size` prop, never arbitrary Tailwind classes that may not be compiled.
 * The widget components carry their own (compiled) appearance.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { Plus, Search, Settings, Trash2, Gauge, Sparkles, Zap } from "lucide-react";

import { Button, IconButton } from "@side-chat/side-chat-widget/ui/button";
import { Switch } from "@side-chat/side-chat-widget/ui/switch";
import { Segmented, type SegmentedItem } from "@side-chat/side-chat-widget/ui/segmented";

const row: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.75rem",
};

export function ButtonDemo() {
  return (
    <div style={row}>
      <Button variant="primary">
        <Sparkles size={16} />
        Primary
      </Button>
      <Button variant="secondary">
        <Plus size={16} />
        New chat
      </Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="primary" disabled>
        <Plus size={16} />
        Disabled
      </Button>
      <IconButton aria-label="Search">
        <Search size={16} />
      </IconButton>
      <IconButton aria-label="Settings">
        <Settings size={16} />
      </IconButton>
      <IconButton aria-label="Delete conversation">
        <Trash2 size={16} />
      </IconButton>
    </div>
  );
}

function SwitchRow({
  title,
  hint,
  control,
}: {
  title: string;
  hint: string;
  control: ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1.5rem",
      }}
    >
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--foreground)" }}>
          {title}
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>{hint}</span>
      </span>
      {control}
    </label>
  );
}

export function SwitchDemo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "22rem" }}>
      <SwitchRow
        title="Send on Enter"
        hint="Shift+Enter inserts a newline"
        control={<Switch defaultChecked />}
      />
      <SwitchRow
        title="Stream responses"
        hint="Render tokens as they arrive"
        control={<Switch />}
      />
      <SwitchRow
        title="Web search"
        hint="Unavailable on this model"
        control={<Switch disabled />}
      />
    </div>
  );
}

export function SegmentedDemo() {
  const [level, setLevel] = useState("auto");
  const items: SegmentedItem[] = [
    { id: "off", label: "Off", Icon: Zap },
    { id: "auto", label: "Auto", Icon: Gauge },
    { id: "max", label: "Max", Icon: Sparkles },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "20rem" }}>
      <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--muted-foreground)" }}>
        Thinking level
      </span>
      <Segmented items={items} value={level} onValueChange={setLevel} />
      <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
        Selected: <code>{level}</code>
      </span>
    </div>
  );
}

/** A live grid of theme color swatches — rendered inside <Preview> so it re-skins. */
export function ColorSwatches() {
  const tokens: { name: string; var: string; onDark?: boolean }[] = [
    { name: "background", var: "--background" },
    { name: "foreground", var: "--foreground", onDark: true },
    { name: "primary", var: "--primary", onDark: true },
    { name: "muted", var: "--muted" },
    { name: "accent", var: "--accent" },
    { name: "border", var: "--border" },
    { name: "destructive", var: "--destructive", onDark: true },
    { name: "success", var: "--success", onDark: true },
    { name: "sc-canvas", var: "--sc-canvas" },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(8rem, 1fr))",
        gap: "0.75rem",
      }}
    >
      {tokens.map((t) => (
        <div key={t.var} style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <div
            style={{
              height: "3rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: `var(${t.var})`,
            }}
          />
          <span style={{ fontSize: "0.6875rem", color: "var(--muted-foreground)" }}>
            {t.name}
          </span>
        </div>
      ))}
    </div>
  );
}
