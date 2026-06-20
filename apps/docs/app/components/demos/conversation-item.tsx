/**
 * Demo: Conversation item — the standalone <button> form of Row.
 *
 * A short selectable list of conversation entries. Selection is controlled with
 * useState so the active row (aria-current) and its trailing dot update live.
 * Demo-level layout uses inline styles + widget tokens; the ConversationItem
 * component carries its own compiled appearance.
 */
import { useState } from "react";

import { ConversationItem } from "@side-chat/side-chat-widget/ui/conversation-item";

const ITEMS = [
  { id: "1", title: "Refactor the turn reducer keystone", when: "2 minutes ago" },
  { id: "2", title: "Scoped token approach for widget themes", when: "Yesterday" },
  {
    id: "3",
    title: "Why does the composer reflow on selection? A very long title that truncates",
    when: "Tuesday",
  },
  { id: "4", title: "RC blocked-terminal rollout gaps", when: "Last week" },
];

export function ConversationItemDemo() {
  const [activeId, setActiveId] = useState("1");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1px", maxWidth: "16rem" }}>
      {ITEMS.map((item) => (
        <ConversationItem
          key={item.id}
          title={item.title}
          when={item.when}
          active={item.id === activeId}
          onSelect={() => setActiveId(item.id)}
        />
      ))}
    </div>
  );
}
