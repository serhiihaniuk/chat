/**
 * Demo for Reasoning. Renders the REAL <Reasoning> foldable trace twice:
 * a live "thinking" trace (label shimmers, a tool still running, panel open) and a
 * completed trace whose open state is user-toggled via a control button. The panel
 * interleaves thought lines and tool rows as siblings in stream order. Layout here
 * uses inline styles + widget tokens so it survives inside <Preview>'s shadow root.
 */
import { useState } from "react";

import { Reasoning, type ReasoningItem } from "@side-chat/side-chat-widget/ui/reasoning";

const LIVE_TRACE: ReasoningItem[] = [
  { kind: "thought", id: "l1", text: "Reading the conversation context and the user's request." },
  { kind: "tool", id: "l2", name: "search_files", state: "success" },
  { kind: "thought", id: "l3", text: "Scanning the matched paths for the relevant handler." },
  { kind: "tool", id: "l4", name: "read_file", state: "running" },
];

const DONE_TRACE: ReasoningItem[] = [
  { kind: "thought", id: "d1", text: "Located the reducer that owns the turn state." },
  { kind: "tool", id: "d2", name: "read_file", state: "success" },
  { kind: "thought", id: "d3", text: "Confirmed the fix before drafting the reply." },
  { kind: "tool", id: "d4", name: "run_tests", state: "success" },
];

export function ReasoningDemo() {
  const [doneOpen, setDoneOpen] = useState(false);

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
      {/* Live: still thinking, panel open, one tool running. */}
      <Reasoning items={LIVE_TRACE} label="Thinking…" thinking open onOpenChange={() => {}} />

      {/* Completed: collapsed by default, trigger toggles via the control below. */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Reasoning
          items={DONE_TRACE}
          label="Thought for 6s"
          open={doneOpen}
          onOpenChange={setDoneOpen}
        />
        <button
          type="button"
          onClick={() => setDoneOpen((v) => !v)}
          style={{
            alignSelf: "flex-start",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            background: "var(--card)",
            padding: "0.375rem 0.75rem",
            fontSize: "0.875rem",
            color: "var(--foreground)",
            cursor: "pointer",
          }}
        >
          {doneOpen ? "Collapse" : "Expand"} reasoning
        </button>
      </div>
    </div>
  );
}
