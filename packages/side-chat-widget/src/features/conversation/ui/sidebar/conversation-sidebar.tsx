import { PlusIcon } from "lucide-react";

import { useWidgetLabels, type WidgetLabels } from "#shared/lib/widget-labels";
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
  runningConversationIds,
}: {
  readonly conversations: readonly ConversationSummaryView[];
  readonly onNewConversation: () => void;
  readonly onSelectConversation: (conversationId: string | undefined) => void;
  readonly selectedConversationId: string | undefined;
  readonly runningConversationIds: ReadonlySet<string>;
}) => {
  const labels = useWidgetLabels();
  return (
    <nav aria-label={labels.headerConversations} className="sc-rail">
      <div className="sc-rail-newchat border-b border-border">
        <Button
          className="w-full justify-start gap-2 px-2.5 py-2 text-left"
          onClick={onNewConversation}
          type="button"
          variant="secondary"
        >
          <PlusIcon className="size-4 text-primary" />
          {labels.conversationNewChat}
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <ScrollArea className="px-2 pb-2">
          <ConversationGrouping
            activeId={selectedConversationId}
            buckets={toConversationBuckets(conversations, runningConversationIds, labels)}
            onSelect={onSelectConversation}
          />
        </ScrollArea>
      </div>
    </nav>
  );
};

const toConversationBuckets = (
  conversations: readonly ConversationSummaryView[],
  runningConversationIds: ReadonlySet<string>,
  labels: WidgetLabels,
) =>
  groupConversationsByDate(conversations, labels).map((group) => ({
    id: group.id,
    label: group.label,
    items: group.conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      when: formatRelativeTime(conversation.lastMessageAt, labels),
      updatedAt: readUpdatedAt(conversation.lastMessageAt),
      running: runningConversationIds.has(conversation.id),
    })),
  }));

const readUpdatedAt = (value: string | undefined): number => {
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? time : 0;
};
