import type { ReactNode } from "react";

import type { WidgetMessage } from "#entities/chat";
import type { ReasoningVisibility } from "#entities/settings";
import {
  Conversation,
  ConversationContent,
  ConversationFollowTrigger,
  ConversationScrollButton,
} from "#shared/ui/conversation";
import { ErrorNotice } from "#shared/ui/error-notice";
import { WidgetMessageView } from "./widget-message-view.js";

export const WidgetConversation = ({
  emptyState,
  errorMessage,
  isLoadingHistory,
  messages,
  onRetry,
  reasoningVisibility,
}: {
  readonly emptyState: ReactNode;
  readonly errorMessage: string | undefined;
  readonly isLoadingHistory: boolean;
  readonly messages: readonly WidgetMessage[];
  readonly onRetry: () => void;
  readonly reasoningVisibility: ReasoningVisibility;
}) => {
  const isEmpty = messages.length === 0 && !errorMessage;
  const latestUserMessageId = readLatestUserMessageId(messages);
  const showEmptyState = isEmpty && !isLoadingHistory;

  return (
    <Conversation aria-label="Conversation feed">
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
              />
            ))}
            {errorMessage && <WidgetError message={errorMessage} onRetry={onRetry} />}
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

export const WidgetError = ({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) => <ErrorNotice message={message} onRetry={onRetry} />;
