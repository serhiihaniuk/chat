/**
 * §9.12 — Shell · Rail · Header (the alignment contract).
 *
 * Composes the whole kit into the floating widget panel. The alignment contract is
 * carried entirely by shared tokens read in the hook classes (already in styles.css):
 *   • sc-panel        — absolute bottom-right, clipped by --radius-xl, max viewport−32px.
 *   • sc-header       — height --header-h, the divider lives on its bottom border.
 *   • sc-rail         — width --size-sidebar, no header of its own.
 *   • sc-rail-newchat — height --rail-newchat-h (== --header-h), so "New chat" and the
 *                       header title share one Y and the divider is continuous at y=--header-h.
 *
 * Scroll model: the rail uses Base UI ScrollArea (§8.3); the chat log uses NATIVE
 * stick-to-bottom scrolling (`flex-1 overflow-y-auto`) — never a ScrollArea (§7.8).
 */
import { type CSSProperties, type ReactElement } from "react";
import { Plus, Settings, X } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { ScrollArea } from "#shared/ui/scroll-area";
import { IconButton } from "#shared/ui/button";
import { ConversationItem } from "#shared/ui/conversation-item";
import { Message } from "#shared/ui/message";
import { Composer } from "#shared/ui/composer";

type Convo = { id: string; title: string; when: string; active?: boolean };
type Bucket = { id: string; label: string; items: Convo[] };

const BUCKETS: Bucket[] = [
  {
    id: "recent",
    label: "Recent",
    items: [{ id: "c1", title: "Page Summary Request", when: "30m ago", active: true }],
  },
  {
    id: "week",
    label: "This week",
    items: [
      { id: "c2", title: "Q3 launch checklist", when: "Tue" },
      { id: "c3", title: "Debounce helper", when: "Mon" },
    ],
  },
  {
    id: "older",
    label: "Older",
    items: [
      { id: "c4", title: "API error triage", when: "Apr 2" },
      { id: "c5", title: "Release notes outline", when: "Mar 28" },
    ],
  },
];

const THREAD: { id: string; role: "user" | "assistant"; text: string }[] = [
  { id: "m1", role: "user", text: "Summarize this page" },
  {
    id: "m2",
    role: "assistant",
    text: "I can summarize it, but I don't have the page open yet — open it and I'll pull the key points.",
  },
];

export function Shell({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
} = {}): ReactElement {
  return (
    <div className={cn("sc-panel w-full max-w-measure-message", className)} style={style}>
      <div className="flex min-h-0 flex-1">
        <SidebarRail />

        {/* ── Main column: header + native-scroll chat log + composer ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sc-header">
            {/* agent mark (hollow diamond + center node) + assistant title */}
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="sc-agent-mark">
                <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2.5 L20.5 12 L12 21.5 L3.5 12 Z M12 6.2 L17.2 12 L12 17.8 L6.8 12 Z"
                  />
                  <circle cx="12" cy="12" r="1.7" />
                </svg>
              </span>
              <span className="truncate text-md font-semibold text-foreground">
                Workspace Assistant
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton aria-label="Settings">
                <Settings className="size-4" />
              </IconButton>
              <IconButton aria-label="New chat">
                <Plus className="size-4" />
              </IconButton>
              <IconButton aria-label="Close">
                <X className="size-4" />
              </IconButton>
            </div>
          </header>

          {/* chat log — NATIVE stick-to-bottom scroll, never a ScrollArea (§7.8) */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto flex max-w-measure-message flex-col gap-4">
              {THREAD.map((m) => (
                <Message key={m.id} role={m.role} text={m.text} />
              ))}
            </div>
          </div>

          <div className="shrink-0 px-3 pb-3">
            <Composer placeholder="Ask about this page…" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SidebarRail(): ReactElement {
  return (
    <aside className="sc-rail">
      <div className="sc-rail-newchat border-b border-sidebar-border">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent px-2.5 py-2 text-left text-sm font-medium text-sidebar-foreground"
        >
          <Plus className="size-4 text-primary" />
          New chat
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <ScrollArea className="px-2 pb-2">
          <div className="flex flex-col" style={{ gap: "var(--rail-group-gap)" }}>
            {BUCKETS.map((bucket) =>
              bucket.items.length ? (
                <section key={bucket.id} className="flex flex-col gap-px">
                  <div className="px-2 pt-3 pb-1.5 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                    {bucket.label}
                  </div>
                  {bucket.items.map((conversation) => (
                    <ConversationItem
                      key={conversation.id}
                      active={conversation.active}
                      title={conversation.title}
                      when={conversation.when}
                    />
                  ))}
                </section>
              ) : null,
            )}
          </div>
        </ScrollArea>
      </div>
    </aside>
  );
}

export function ShellSection(): ReactElement {
  return (
    <div className="flex justify-center">
      <Shell
        style={{
          position: "relative",
          right: "auto",
          bottom: "auto",
          height: "284px",
          maxWidth: "560px",
          margin: "0 auto",
        }}
      />
    </div>
  );
}

export function SidebarRailSection(): ReactElement {
  return (
    <div className="flex justify-center" style={{ height: "300px" }}>
      <div className="h-full overflow-hidden rounded-lg border border-sidebar-border">
        <SidebarRail />
      </div>
    </div>
  );
}
