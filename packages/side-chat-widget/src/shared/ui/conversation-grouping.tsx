/**
 * §9.2 — Conversation grouping.
 *
 * Conversation items (§9.1) bucketed by last-activity into Recent · This week ·
 * Older, each bucket a `<section>` under a `--group-label-*` overline. Bucketing
 * keys off `updatedAt`, not creation; an empty bucket renders nothing (no orphan
 * heading), and items are newest-first within a bucket. Buckets are separated by
 * `--rail-group-gap`. No Base UI parts — plain layout around §9.1.
 */
import type { ReactElement } from "react";
import { useState } from "react";

import { ConversationItem } from "#shared/ui/conversation-item";

type Conversation = {
  id: string;
  title: string;
  when: string;
  updatedAt: number;
};

type Bucket = {
  id: string;
  label: string;
  items: Conversation[];
};

export function ConversationGrouping({
  buckets,
  activeId,
  onSelect,
}: {
  buckets: Bucket[];
  activeId?: string;
  onSelect?: (id: string) => void;
}): ReactElement {
  return (
    <div className="flex flex-col" style={{ gap: "var(--rail-group-gap)" }}>
      {buckets.map((bucket) =>
        bucket.items.length ? (
          <section key={bucket.id} className="flex flex-col gap-0.5">
            <div className="px-2.5 pt-1.5 pb-1 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
              {bucket.label}
            </div>
            {bucket.items
              .slice()
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  title={conversation.title}
                  when={conversation.when}
                  active={conversation.id === activeId}
                  onSelect={() => onSelect?.(conversation.id)}
                />
              ))}
          </section>
        ) : null,
      )}
    </div>
  );
}

const BUCKETS: Bucket[] = [
  {
    id: "recent",
    label: "Recent",
    items: [
      { id: "1", title: "Refactor the turn reducer keystone", when: "2 minutes ago", updatedAt: 5 },
      { id: "2", title: "Scoped token approach for widget themes", when: "1 hour ago", updatedAt: 4 },
      { id: "3", title: "Greenfield widget design direction", when: "Today", updatedAt: 3 },
    ],
  },
  // "This week" is intentionally empty to prove empty buckets render nothing.
  { id: "week", label: "This week", items: [] },
  {
    id: "older",
    label: "Older",
    items: [
      {
        id: "4",
        title: "Why does the composer reflow on selection? A very long title that truncates",
        when: "Last week",
        updatedAt: 2,
      },
      { id: "5", title: "RC blocked-terminal rollout gaps", when: "2 weeks ago", updatedAt: 1 },
    ],
  },
];

export function ConversationGroupingSection(): ReactElement {
  const [activeId, setActiveId] = useState("1");
  return (
    <div className="w-64">
      <ConversationGrouping buckets={BUCKETS} activeId={activeId} onSelect={setActiveId} />
    </div>
  );
}
