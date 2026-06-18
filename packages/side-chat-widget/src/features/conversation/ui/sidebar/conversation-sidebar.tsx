import { ScrollArea } from "#shared/ui/scroll-area";
import { cn } from "#shared/lib/cn";
import { PlusIcon } from "lucide-react";

import {
  formatRelativeTime,
  groupConversationsByDate,
  type ConversationSummaryView,
} from "../../model/conversation-options.js";

// Persistent conversation rail shown when the panel is wide enough. Uses the sidebar
// token group so it reads as a distinct surface, and becomes the conversation
// switcher in place of the header dropdown.
export const ConversationSidebar = ({
  conversations,
  disabled,
  onNewConversation,
  onSelectConversation,
  selectedConversationId,
}: {
  readonly conversations: readonly ConversationSummaryView[];
  readonly disabled: boolean;
  readonly onNewConversation: () => void;
  readonly onSelectConversation: (conversationId: string | undefined) => void;
  readonly selectedConversationId: string | undefined;
}) => (
  <nav
    aria-label="Conversations"
    className="flex w-62 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
  >
    {/* Same height as the header so the New chat button lines up with the title. */}
    <div className="flex h-13 shrink-0 items-center px-3">
      <button
        className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent px-2.5 py-1.5 text-left font-medium text-[0.8125rem] leading-5 transition-[filter] hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
        disabled={disabled && selectedConversationId === undefined}
        onClick={onNewConversation}
        type="button"
      >
        <PlusIcon className="size-4 text-primary" />
        New chat
      </button>
    </div>
    {conversations.length > 0 && (
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pb-3">
          {groupConversationsByDate(conversations).map((group) => (
            <section key={group.id}>
              <p className="px-2 pt-2 pb-[7px] font-semibold text-[0.656rem] text-muted-foreground uppercase tracking-[0.08em]">
                {group.label}
              </p>
              <ul className="space-y-px">
                {group.conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <ConversationRow
                      conversation={conversation}
                      isActive={conversation.id === selectedConversationId}
                      onSelect={onSelectConversation}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </ScrollArea>
    )}
  </nav>
);

const ConversationRow = ({
  conversation,
  isActive,
  onSelect,
}: {
  readonly conversation: ConversationSummaryView;
  readonly isActive: boolean;
  readonly onSelect: (conversationId: string | undefined) => void;
}) => (
  <button
    className={cn(
      "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      isActive && "bg-sidebar-accent",
    )}
    onClick={() => onSelect(conversation.id)}
    type="button"
  >
    <span className="truncate text-[0.8125rem] text-sidebar-foreground">{conversation.title}</span>
    <span className="truncate text-[0.6875rem] text-muted-foreground">
      {formatRelativeTime(conversation.lastMessageAt)}
    </span>
  </button>
);
