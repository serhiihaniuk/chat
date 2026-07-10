/**
 * Demo for Collapsible. Renders the REAL <Collapsible> fold twice: a
 * controlled trace whose open state is toggled by a button, and a second fold that
 * starts open. Each panel height animates from Base UI's exposed
 * `--collapsible-panel-height` through the `sc-collapsible-panel` hook class — no JS
 * scrollHeight measure. Wrapper layout uses inline styles + widget tokens so it
 * survives inside <Preview>'s shadow root.
 */
import { useState } from "react";

import { Collapsible } from "@side-chat/side-chat-widget/ui/collapsible";

export function CollapsibleDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        maxWidth: "32rem",
        color: "var(--foreground)",
      }}
    >
      {/* Controlled: a parent owns `open`; the button below drives it. */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Collapsible open={open} onOpenChange={setOpen} label="Reasoning">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.25rem",
              padding: "0.5rem 0 0.5rem 0.75rem",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--foreground)" }}>
              Reading the conversation context.
            </p>
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--muted-foreground)" }}>
              Checking the requested file paths.
            </p>
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--muted-foreground)" }}>
              Drafting a minimal, 1:1 answer.
            </p>
          </div>
        </Collapsible>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            alignSelf: "flex-start",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            background: "var(--card)",
            padding: "0.375rem 0.75rem",
            fontSize: "0.8125rem",
            color: "var(--foreground)",
            cursor: "pointer",
          }}
        >
          {open ? "Collapse" : "Expand"} panel
        </button>
      </div>

      {/* Uncontrolled-style second fold, rendered open to show the panel border + content. */}
      <Collapsible open onOpenChange={() => {}} label="Sources">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            padding: "0.5rem 0 0.5rem 0.75rem",
          }}
        >
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--muted-foreground)" }}>
            packages/side-chat-widget/src/shared/ui/collapsible.tsx
          </p>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--muted-foreground)" }}>
            packages/side-chat-widget/src/styles.css
          </p>
        </div>
      </Collapsible>
    </div>
  );
}
