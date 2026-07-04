/**
 * Shell composition for the floating widget panel.
 *
 * The shell owns the two-column demo layout: conversation rail, header, native
 * scrolling message log, and composer. Floating chrome and drag resize belong to
 * the panel feature in the live widget, so this showcase stays static.
 */
import { type ReactElement } from "react";
import { Plus, Settings, X } from "lucide-react";

import { AgentMark } from "#shared/ui/agent-mark";
import { Button, IconButton } from "#shared/ui/button";
import { Composer } from "#shared/ui/composer";
import { ConversationItem } from "#shared/ui/conversation-item";
import { Message } from "#shared/ui/message";
import { ScrollArea } from "#shared/ui/scroll-area";

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
    text: "I can summarize it, but I do not have the page open yet. Open it and I will pull the key points.",
  },
];

export function Shell(): ReactElement {
  return (
    <div className="flex min-h-0 flex-1">
      <SidebarRail />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sc-header">
          <div className="flex min-w-0 items-center gap-2.5">
            <AgentMark className="size-4 shrink-0 text-primary" />
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

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto flex max-w-measure-message flex-col gap-4">
            {THREAD.map((message) => (
              <Message key={message.id} role={message.role} text={message.text} />
            ))}
          </div>
        </div>

        <div className="shrink-0 px-3 pb-3">
          <Composer placeholder="Ask about this page..." />
        </div>
      </div>
    </div>
  );
}

export function SidebarRail(): ReactElement {
  return (
    <aside className="sc-rail">
      <div className="sc-rail-newchat border-b border-border">
        <Button
          type="button"
          className="w-full justify-start gap-2 px-2.5 py-2 text-left"
          variant="secondary"
        >
          <Plus className="size-4 text-primary" />
          New chat
        </Button>
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
