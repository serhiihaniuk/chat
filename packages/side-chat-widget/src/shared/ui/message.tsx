/**
 * §9.6 — Message.
 *
 * The leaf that renders one turn of conversation text. No Base UI part — a turn is
 * a semantic `<div data-from>` whose role drives layout and skin entirely through
 * the `data-[from=user]:` variant, so the SAME component renders both sides.
 *
 *   user      → a right-aligned bubble with one squared tail corner (rounded-br-sm),
 *               capped at 82% of the column so long lines wrap before the edge.
 *   assistant → no bubble; full-measure prose rendered through `MarkdownContent`
 *               (the ONE Markdown wrapper) and capped at the reading measure.
 *
 * The 82% cap is an inline style (a runtime value, not a class) so it never needs an
 * arbitrary `max-w-[..]` utility; leading is the registered `leading-message` token.
 */
import type { ReactElement } from "react";

import { MarkdownContent } from "#shared/ai/markdown-content";

export type MessageRole = "user" | "assistant";

export function Message({
  role,
  text,
}: {
  role: MessageRole;
  text: string;
}): ReactElement {
  return (
    <div
      data-from={role}
      className="data-[from=user]:flex data-[from=user]:justify-end"
    >
      {role === "user" ? (
        <div
          className="w-fit rounded-lg rounded-br-sm bg-message-user text-message-user-foreground px-3.5 py-2.5 text-md leading-message"
          style={{ maxWidth: "82%" }}
        >
          {text}
        </div>
      ) : (
        <div className="sc-markdown max-w-measure-message text-md">
          <MarkdownContent>{text}</MarkdownContent>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

const USER_1 = "How do I memoize an expensive value in React?";

const ASSISTANT_1 = `Use the \`useMemo\` hook — it caches the result between renders and only recomputes when a dependency changes.

- Pass a factory function and a dependency array
- Reach for it when the computation is genuinely expensive
- For functions you pass as props, prefer \`useCallback\``;

const USER_2 = "And what about a really long message that needs to wrap before it touches the edge of the column?";

const ASSISTANT_2 = `Long user turns cap at **82%** of the column width, so they always wrap a little before the edge instead of filling the whole row.`;

export function MessageSection(): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <Message role="user" text={USER_1} />
      <Message role="assistant" text={ASSISTANT_1} />
      <Message role="user" text={USER_2} />
      <Message role="assistant" text={ASSISTANT_2} />
    </div>
  );
}
