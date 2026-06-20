/**
 * Demo for §9.3 Tools menu — renders the REAL <ToolsMenu /> composition.
 *
 * The component is fully self-contained: it owns its own tool-toggle and
 * context-scope state, and reads the portal container from the surrounding
 * <SideChatWidgetRoot> (provided by the page). The trigger is the composer `+`
 * button whose glyph rotates `+`→`×` on open; the popup mounts on top with
 * checkbox tool rows (each carrying a presentational Switch) and a radio scope
 * group. This demo only supplies its own column layout + a hint via inline
 * styles and widget tokens — the menu carries its own compiled appearance.
 */
import { ToolsMenu } from "@side-chat/side-chat-widget/ui/tools-menu";

export function ToolsMenuDemo() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "0.75rem",
        maxWidth: "20rem",
        color: "var(--foreground)",
      }}
    >
      <ToolsMenu />
      <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0 }}>
        Click the{" "}
        <span style={{ fontWeight: 600, color: "var(--foreground)" }}>+</span> to open the menu —
        toggle a tool or pick a context scope.
      </p>
    </div>
  );
}
