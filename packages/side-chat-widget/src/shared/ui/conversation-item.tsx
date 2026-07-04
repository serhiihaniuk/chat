/**
 * §9.1 — Conversation item.
 *
 * The standalone <button> form of Row: a single selectable conversation entry in
 * the sidebar list. No Base UI part — a plain button, so it may use `hover:` and
 * expresses its own selected state through `aria-current` (semantic, announced by
 * screen readers) rather than a faked class. The trailing dot is pre-rendered at
 * `opacity-0` so toggling selection never reflows the row.
 */
import { type ReactElement } from "react";

import { cn } from "#shared/lib/cn";

const conversationItemClass =
  "flex w-full cursor-pointer select-none items-center gap-(--row-gap) rounded-(--convo-item-radius) px-(--row-px) py-(--row-py) text-left";

export function ConversationItem({
  title,
  when,
  active,
  running,
  onSelect,
}: {
  title: string;
  when: string;
  active?: boolean | undefined;
  running?: boolean | undefined;
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
      {running === true ? (
        // Live turn: a pulsing dot, shown regardless of selection. Same size as the
        // selection dot so toggling it never reflows the row.
        <span
          aria-label="Generating"
          className="ml-auto size-1.5 shrink-0 animate-pulse rounded-full bg-(--convo-running-indicator)"
        />
      ) : (
        <span className="ml-auto size-1.5 shrink-0 rounded-full bg-(--convo-indicator) opacity-0 aria-[current=true]:opacity-100" />
      )}
    </button>
  );
}
