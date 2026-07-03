/**
 * Demo for Tool detail — renders the REAL <ToolDetailRow> from the widget: the
 * expandable form of the §9.9 tool row. One row expanded (input + result JSON
 * blocks), one resolved host command (status · resultCode lead line), and one
 * failed call (distinct error-code line). Layout uses inline styles + widget
 * tokens so it survives inside <Preview>'s shadow root.
 */
import { ToolDetailRow } from "@side-chat/side-chat-widget/ui/activity/tool-detail";

export function ToolDetailDemo() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.625rem",
        maxWidth: "28rem",
        color: "var(--foreground)",
      }}
    >
      <ToolDetailRow
        defaultOpen
        detail={{
          input: { query: "current portfolio news" },
          result: { summary: "Found 3 briefing-style results." },
        }}
        name="Search web"
        state="success"
      />
      <ToolDetailRow
        detail={{ statusLine: "applied · resource_opened", input: { resourceId: "ticket-4821" } }}
        name="Open resource"
        state="success"
      />
      <ToolDetailRow
        detail={{ errorCode: "tool_failed", input: { path: "/reports/q4" } }}
        name="Read file"
        state="error"
      />
    </div>
  );
}
