/**
 * Demo for §9.2 Conversation grouping — rendered inside <Preview>'s shadow root.
 *
 * Only the widget's compiled stylesheet is present, so this file's own layout uses
 * inline styles + widget tokens (var(--…)); the real ConversationGrouping carries
 * its own compiled appearance. Selection is controlled via useState so the rail is
 * interactive. The "This week" bucket is intentionally empty to show that empty
 * buckets render no orphan heading.
 */
import { useState } from "react";

import { ConversationGrouping } from "@side-chat/side-chat-widget/ui/conversation-grouping";

const BUCKETS = [
  {
    id: "recent",
    label: "Recent",
    items: [
      { id: "1", title: "Scoped token approach for widget themes", when: "2 minutes ago", updatedAt: 6 },
      { id: "2", title: "Turn reducer keystone design", when: "1 hour ago", updatedAt: 5 },
      { id: "3", title: "Floating panel layout pass", when: "Today", updatedAt: 4 },
    ],
  },
  // Empty on purpose: an empty bucket renders nothing (no orphan heading).
  { id: "week", label: "This week", items: [] },
  {
    id: "older",
    label: "Older",
    items: [
      {
        id: "4",
        title: "Why does the composer reflow on selection? A long title that truncates",
        when: "Last week",
        updatedAt: 3,
      },
      { id: "5", title: "RC blocked-terminal rollout gaps", when: "2 weeks ago", updatedAt: 2 },
      { id: "6", title: "Host iframe state resend", when: "Last month", updatedAt: 1 },
    ],
  },
];

export function ConversationGroupingDemo() {
  const [activeId, setActiveId] = useState("1");
  return (
    <div
      style={{
        maxWidth: "15.5rem",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        background: "var(--sidebar)",
        padding: "calc(var(--spacing) * 2)",
      }}
    >
      <ConversationGrouping buckets={BUCKETS} activeId={activeId} onSelect={setActiveId} />
    </div>
  );
}
