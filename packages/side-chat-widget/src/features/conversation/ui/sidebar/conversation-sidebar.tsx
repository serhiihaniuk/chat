import { PlusIcon } from "lucide-react";

import { Button } from "#shared/ui/button";
import { ConversationGrouping } from "#shared/ui/conversation-grouping";
import { ScrollArea } from "#shared/ui/scroll-area";
import {
  formatRelativeTime,
  groupConversationsByDate,
  type ConversationSummaryView,
} from "../../model/conversation-options.js";

export const ConversationSidebar = ({
  conversations,
  onNewConversation,
  onSelectConversation,
  selectedConversationId,
}: {
  readonly conversations: readonly ConversationSummaryView[];
  readonly onNewConversation: () => void;
  readonly onSelectConversation: (conversationId: string | undefined) => void;
  readonly selectedConversationId: string | undefined;
}) => (
  <nav aria-label="Conversations" className="sc-rail">
    <div className="sc-rail-newchat border-b border-sidebar-border">
      <Button
        className="w-full justify-start gap-2 border-sidebar-border bg-sidebar-accent px-2.5 py-2 text-left text-sidebar-foreground"
        onClick={onNewConversation}
        type="button"
        variant="secondary"
      >
        <PlusIcon className="size-4 text-primary" />
        New chat
      </Button>
    </div>
    <div className="min-h-0 flex-1">
      <ScrollArea className="px-2 pb-2">
        <ConversationGrouping
          activeId={selectedConversationId}
          buckets={toConversationBuckets(conversations)}
          onSelect={onSelectConversation}
        />
      </ScrollArea>
    </div>
  </nav>
);

const toConversationBuckets = (conversations: readonly ConversationSummaryView[]) =>
  groupConversationsByDate(conversations).map((group) => ({
    id: group.id,
    label: group.label,
    items: group.conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      when: formatRelativeTime(conversation.lastMessageAt),
      updatedAt: readUpdatedAt(conversation.lastMessageAt),
    })),
  }));

const readUpdatedAt = (value: string | undefined): number => {
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? time : 0;
};
