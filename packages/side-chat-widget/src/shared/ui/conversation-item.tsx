/**
 * §9.1 — Conversation item.
 *
 * The standalone <button> form of Row: a single selectable conversation entry in
 * the sidebar list. No Base UI part — a plain button, so it may use `hover:` and
 * expresses its own selected state through `aria-current` (semantic, announced by
 * screen readers) rather than a faked class. The trailing dot is pre-rendered at
 * `opacity-0` so toggling selection never reflows the row.
 */
import { useState, type ReactElement } from "react";

import { cn } from "#shared/lib/cn";

const conversationItemClass =
  "flex w-full cursor-pointer select-none items-center gap-(--row-gap) rounded-(--convo-item-radius) px-(--row-px) py-(--row-py) text-left";

export function ConversationItem({
  title,
  when,
  active,
  onSelect,
}: {
  title: string;
  when: string;
  active?: boolean | undefined;
  onSelect?: (() => void) | undefined;
}): ReactElement {
  return (
    <button
      type="button"
      aria-current={active === true ? true : undefined}
      onClick={onSelect}
      className={cn(
        conversationItemClass,
        "hover:bg-(--convo-item-bg-hover) aria-[current=true]:bg-(--convo-item-bg-active)",
      )}
    >
      <span className="flex flex-col min-w-0 gap-0.5">
        <span className="truncate text-sm font-medium text-(--convo-title-fg)">{title}</span>
        <span className="truncate text-xs text-(--convo-subtitle-fg)">{when}</span>
      </span>
      <span className="ml-auto size-1.5 rounded-full bg-(--convo-indicator) opacity-0 aria-[current=true]:opacity-100" />
    </button>
  );
}

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

export function ConversationItemSection(): ReactElement {
  const [activeId, setActiveId] = useState("1");
  return (
    <div className="flex flex-col gap-0.5 w-64">
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
