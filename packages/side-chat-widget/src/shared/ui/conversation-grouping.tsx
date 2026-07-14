/**
 * Conversation grouping.
 *
 * Conversation items bucketed by last-activity into Recent · This week ·
 * Older, each bucket a `<section>` under a `--group-label-*` overline. Bucketing
 * keys off `updatedAt`, not creation; an empty bucket renders nothing (no orphan
 * heading), and items are newest-first within a bucket. Buckets are separated by
 * `--rail-group-gap`. No Base UI parts — plain layout around conversation items.
 */
import { type ReactElement } from "react";

import { ConversationItem } from "#shared/ui/conversation-item";

type Conversation = {
  id: string;
  title: string;
  when: string;
  updatedAt: number;
  running?: boolean | undefined;
};

type Bucket = {
  id: string;
  label: string;
  items: Conversation[];
};

export function ConversationGrouping({
  buckets,
  activeId,
  disabled,
  onSelect,
}: {
  buckets: readonly Bucket[];
  activeId?: string | undefined;
  disabled?: boolean | undefined;
  onSelect?: ((id: string) => void) | undefined;
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
                  disabled={disabled}
                  running={conversation.running}
                  onSelect={() => onSelect?.(conversation.id)}
                />
              ))}
          </section>
        ) : null,
      )}
    </div>
  );
}
