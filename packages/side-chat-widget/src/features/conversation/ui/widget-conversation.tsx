import type { ReactNode } from "react";

import type { WidgetMessage, WidgetRunNotice } from "#entities/chat";
import {
  DEFAULT_TOOL_DETAIL_LEVEL,
  type ReasoningVisibility,
  type ToolDetailLevel,
} from "#entities/settings";
import { useWidgetLabels } from "#shared/lib/widget-labels";
import {
  Conversation,
  ConversationContent,
  ConversationFollowTrigger,
  ConversationScrollButton,
} from "#shared/ui/conversation";
import { BlockedNotice, ErrorNotice } from "#shared/ui/error-notice";
import type { RenderActivityItem } from "./activity/widget-activity-content.js";
import { WidgetMessageView } from "./widget-message-view.js";

export const WidgetConversation = ({
  emptyState,
  notice,
  isLoadingHistory,
  messages,
  onRetry,
  reasoningVisibility,
  renderActivityItem,
  toolDetail = DEFAULT_TOOL_DETAIL_LEVEL,
}: {
  readonly emptyState: ReactNode;
  readonly notice: WidgetRunNotice | undefined;
  readonly isLoadingHistory: boolean;
  readonly messages: readonly WidgetMessage[];
  readonly onRetry: () => void;
  readonly reasoningVisibility: ReasoningVisibility;
  readonly renderActivityItem?: RenderActivityItem | undefined;
  readonly toolDetail?: ToolDetailLevel | undefined;
}) => {
  const labels = useWidgetLabels();
  const isEmpty = messages.length === 0 && !notice;
  const latestUserMessageId = readLatestUserMessageId(messages);
  const showEmptyState = isEmpty && !isLoadingHistory;

  return (
    <Conversation aria-label={labels.headerConversationFeed}>
      <ConversationContent
        className="mx-auto min-h-full w-full max-w-measure-message gap-4 px-4 pt-4 pb-8"
        scrollClassName="size-full"
        viewportProps={{ "data-slot": "conversation-scroll" }}
      >
        <ConversationFollowTrigger followKey={latestUserMessageId} />
        {showEmptyState && emptyState}
        {isEmpty && isLoadingHistory && <ConversationSkeleton />}
        {!isEmpty && (
          <>
            {messages.map((message) => (
              <WidgetMessageView
                key={message.id}
                message={message}
                reasoningVisibility={reasoningVisibility}
                renderActivityItem={renderActivityItem}
                toolDetail={toolDetail}
              />
            ))}
            {notice && <WidgetNotice notice={notice} onRetry={onRetry} />}
          </>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
};

const readLatestUserMessageId = (messages: readonly WidgetMessage[]): string | undefined => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") return message.id;
  }
  return undefined;
};

const ConversationSkeleton = () => (
  <div
    aria-hidden="true"
    className="mx-auto flex w-full max-w-measure-message animate-pulse flex-col gap-4"
  >
    <span className="ml-auto h-9 w-2/5 rounded-lg rounded-br-sm bg-muted" />
    <span className="flex flex-col gap-2">
      <span className="h-3.5 w-11/12 rounded bg-muted" />
      <span className="h-3.5 w-4/5 rounded bg-muted" />
      <span className="h-3.5 w-3/4 rounded bg-muted" />
    </span>
    <span className="ml-auto h-9 w-1/3 rounded-lg rounded-br-sm bg-muted" />
    <span className="flex flex-col gap-2">
      <span className="h-3.5 w-10/12 rounded bg-muted" />
      <span className="h-3.5 w-2/3 rounded bg-muted" />
    </span>
  </div>
);

// Blocked is a calm safety notice with no Retry; every other notice is the
// retryable error surface.
export const WidgetNotice = ({
  notice,
  onRetry,
}: {
  readonly notice: WidgetRunNotice;
  readonly onRetry: () => void;
}) =>
  notice.kind === "blocked" ? (
    <BlockedNotice message={notice.message} />
  ) : (
    <ErrorNotice message={notice.message} onRetry={onRetry} />
  );
