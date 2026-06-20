/**
 * Demo for §8.12 — Badge & Suggestion.
 *
 * Renders the REAL primitives side by side so the contrast is visible: <Badge> is a
 * non-interactive status pill (a <span>, no hover/focus), while <Suggestion> is an
 * interactive chip (a real <button>, keyboard-focusable, hover:bg-accent). Demo-level
 * layout uses inline styles + widget tokens because the <Preview> shadow root only ships
 * the widget's compiled CSS; each primitive carries its own compiled classes. lucide
 * icons are sized via the `size` prop (12px in badges, 16px in suggestions).
 */
import { Badge, Suggestion } from "@side-chat/side-chat-widget/ui/badge";
import { Sparkles, TriangleAlert, MessageSquare } from "lucide-react";

export function BadgeDemo() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        maxWidth: "32rem",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.6875rem", color: "var(--muted-foreground)" }}>
          Badge — non-interactive status pill
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
          <Badge>New</Badge>
          <Badge>
            <Sparkles size={12} />
            Pro
          </Badge>
          <Badge>
            <TriangleAlert size={12} />
            Deprecated
          </Badge>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.6875rem", color: "var(--muted-foreground)" }}>
          Suggestion — interactive chip (focusable, hover)
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
          <Suggestion>
            <Sparkles size={16} />
            Summarize this page
          </Suggestion>
          <Suggestion>
            <MessageSquare size={16} />
            Draft a reply
          </Suggestion>
        </div>
      </div>
    </div>
  );
}
