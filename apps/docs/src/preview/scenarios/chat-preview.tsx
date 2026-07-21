import type { ReactElement } from "react";

import { Plus, Settings, X } from "lucide-react";

import { AgentMark } from "@side-chat/side-chat-widget/ui/agent-mark";
import { Button, IconButton } from "@side-chat/side-chat-widget/ui/button";
import { Composer } from "@side-chat/side-chat-widget/ui/composer";
import { ConversationItem } from "@side-chat/side-chat-widget/ui/conversation-item";
import { Message } from "@side-chat/side-chat-widget/ui/message";
import { ScrollArea } from "@side-chat/side-chat-widget/ui/scroll-area";

import { PreviewModelSelector, PreviewToolsMenu } from "./preview-composer-controls.js";

type ConversationPreview = {
  readonly active?: boolean;
  readonly id: string;
  readonly title: string;
  readonly when: string;
};

type ConversationBucket = {
  readonly id: string;
  readonly items: readonly ConversationPreview[];
  readonly label: string;
};

const CONVERSATION_BUCKETS: readonly ConversationBucket[] = [
  {
    id: "recent",
    label: "Recent",
    items: [
      {
        id: "c1",
        title: "Page Summary Request",
        when: "30m ago",
        active: true,
      },
    ],
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

const PREVIEW_MESSAGES = [
  { id: "m1", role: "user" as const, text: "Summarize this page" },
  {
    id: "m2",
    role: "assistant" as const,
    text: "I can summarize it, but I do not have the page open yet. Open it and I will pull the key points.",
  },
];

export function ChatPreview(): ReactElement {
  return (
    <div className="flex min-h-0 flex-1">
      <ConversationRail />
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
            {PREVIEW_MESSAGES.map((message) => (
              <Message key={message.id} role={message.role} text={message.text} />
            ))}
          </div>
        </div>
        <div className="shrink-0 px-3 pb-3">
          <Composer
            modelSelector={<PreviewModelSelector />}
            placeholder="Ask about this page..."
            toolsMenu={<PreviewToolsMenu />}
          />
        </div>
      </div>
    </div>
  );
}

function ConversationRail(): ReactElement {
  return (
    <aside className="sc-rail">
      <div className="sc-rail-newchat border-b border-border">
        <Button
          className="w-full justify-start gap-2 px-2.5 py-2 text-left"
          type="button"
          variant="secondary"
        >
          <Plus className="size-4 text-primary" />
          New chat
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <ScrollArea className="px-2 pb-2">
          <div className="flex flex-col" style={{ gap: "var(--rail-group-gap)" }}>
            {CONVERSATION_BUCKETS.map((bucket) => (
              <section key={bucket.id} className="flex flex-col gap-px">
                <div className="px-2 pt-3 pb-1.5 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                  {bucket.label}
                </div>
                {bucket.items.map((conversation) => (
                  <ConversationItem
                    active={conversation.active}
                    key={conversation.id}
                    title={conversation.title}
                    when={conversation.when}
                  />
                ))}
              </section>
            ))}
          </div>
        </ScrollArea>
      </div>
    </aside>
  );
}
