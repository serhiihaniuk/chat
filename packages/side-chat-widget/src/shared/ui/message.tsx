/**
 * Message: render one turn of conversation text.
 *
 * One semantic `<div data-from>` handles both roles. The `data-[from=user]:`
 * styles choose the layout, so user and assistant messages stay in one component.
 *
 * - User messages are right-aligned bubbles with one squared tail corner. They
 *   use an 82% width cap and `break-words`, which also breaks long URLs.
 * - Assistant messages have no bubble. `MarkdownContent` renders the prose at
 *   the normal reading width.
 *
 * The 82% cap is an inline runtime value, so it does not need an arbitrary
 * `max-w-[..]` utility. Line height comes from the `leading-message` token.
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
        <div className="max-w-measure-message text-md">
          <MarkdownContent mode={mode}>{text}</MarkdownContent>
        </div>
      )}
    </div>
  );
}
