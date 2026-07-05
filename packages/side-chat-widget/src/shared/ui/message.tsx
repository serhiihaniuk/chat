/**
 * §9.6 — Message.
 *
 * The leaf that renders one turn of conversation text. No Base UI part — a turn is
 * a semantic `<div data-from>` whose role drives layout and skin entirely through
 * the `data-[from=user]:` variant, so the SAME component renders both sides.
 *
 *   user      → a right-aligned bubble with one squared tail corner (rounded-br-sm),
 *               capped at 82% of the column so long lines wrap before the edge;
 *               `break-words` also breaks an unbroken run (a long URL) inside the cap.
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
  mode = "static",
  role,
  text,
}: {
  mode?: "static" | "streaming";
  role: MessageRole;
  text: string;
}): ReactElement {
  return (
    <div data-from={role} className="data-[from=user]:flex data-[from=user]:justify-end">
      {role === "user" ? (
        <div
          className="w-fit break-words rounded-lg rounded-br-sm bg-message-user text-message-user-foreground px-3.5 py-2.5 text-md leading-message"
          style={{ maxWidth: "82%" }}
        >
          {text}
        </div>
      ) : (
        <div className="sc-markdown max-w-measure-message text-md">
          <MarkdownContent mode={mode}>{text}</MarkdownContent>
        </div>
      )}
    </div>
  );
}
