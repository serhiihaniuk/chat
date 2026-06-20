/**
 * Demo for §8.14 — Separator. Renders the REAL <Separator> (Base UI Separator, so it
 * carries role=separator + aria-orientation) in both orientations: a horizontal rule
 * splitting two stacked text blocks, and a vertical rule between two inline items.
 * Demo-level layout uses inline styles + widget tokens because the <Preview> shadow
 * root only ships the widget's compiled CSS; the component itself carries the real
 * `bg-border` + orientation sizing classes from its source.
 */
import { Separator } from "@side-chat/side-chat-widget/ui/separator";

export function SeparatorDemo() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        width: "100%",
        maxWidth: "24rem",
        color: "var(--foreground)",
      }}
    >
      {/* Horizontal: rule between two stacked text blocks */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--foreground)" }}>
          Conversation settings
        </p>
        <Separator orientation="horizontal" className="my-1.5 h-px bg-border" />
        <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
          Changes apply to new messages only.
        </p>
      </div>

      {/* Vertical: rule between two inline items in a flex row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontSize: "0.8125rem",
          color: "var(--muted-foreground)",
        }}
      >
        <span>Drafts</span>
        <Separator orientation="vertical" className="mx-1.5 w-px self-stretch bg-border" />
        <span>Archived</span>
      </div>
    </div>
  );
}
