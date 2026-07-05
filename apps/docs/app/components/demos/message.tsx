/**
 * Demo for §9.6 Message — renders the REAL <Message> leaf for both roles.
 *
 * A turn is a semantic `<div data-from>`; the role drives layout + skin. The user
 * side is a right-aligned bubble capped at 82% of the column; the assistant side is
 * full-measure Markdown prose. This demo only supplies its own outer column layout
 * via inline styles + widget tokens — the component carries its own appearance.
 */
import { Message } from "@side-chat/side-chat-widget/ui/message";

const USER_1 = "How do I memoize an expensive value in React?";

const ASSISTANT_1 = `Use the \`useMemo\` hook — it caches the result between renders and only recomputes when a dependency changes.

- Pass a factory function and a dependency array
- Reach for it when the computation is genuinely expensive
- For functions you pass as props, prefer \`useCallback\``;

const USER_2 =
  "And what about a really long message that needs to wrap before it touches the edge of the column?";

const ASSISTANT_2 = `Long user turns cap at **82%** of the column width, so they always wrap a little before the edge instead of filling the whole row.`;

// An unbroken run (a long URL with no spaces) must still break inside the 82% cap
// rather than overflow the bubble — the `break-words` fixture the e2e viewport check
// guards.
const USER_3 = `https://example.com/${"a".repeat(180)}`;

export function MessageDemo() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        width: "100%",
        maxWidth: "44.5rem",
        color: "var(--foreground)",
      }}
    >
      <Message role="user" text={USER_1} />
      <Message role="assistant" text={ASSISTANT_1} />
      <Message role="user" text={USER_2} />
      <Message role="assistant" text={ASSISTANT_2} />
      <Message role="user" text={USER_3} />
    </div>
  );
}
