import { Conversation, ConversationContent, ConversationScrollButton } from "#shared/ai/conversation";
import { Button } from "#shared/ui/button";
import { CircleAlertIcon, RotateCwIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { WidgetMessageView } from "./widget-message-view.js";
import type { WidgetMessage } from "#entities/chat";
import type { ReasoningVisibility } from "#entities/settings";

export const WidgetConversation = ({
  emptyState,
  errorMessage,
  isLoadingHistory,
  messages,
  onDismissError,
  onRetry,
  reasoningVisibility,
}: {
  readonly emptyState: ReactNode;
  readonly errorMessage: string | undefined;
  readonly isLoadingHistory: boolean;
  readonly messages: readonly WidgetMessage[];
  readonly onDismissError: () => void;
  readonly onRetry: () => void;
  readonly reasoningVisibility: ReasoningVisibility;
}) => {
  const isEmpty = messages.length === 0 && !errorMessage;
  const showEmptyState = isEmpty && !isLoadingHistory;

  return (
    <Conversation className="min-h-0">
      <ConversationContent className={showEmptyState ? "h-full p-0" : "px-5 pt-[1.375rem] pb-2"}>
        {showEmptyState && emptyState}
        {isEmpty && isLoadingHistory && <ConversationSkeleton />}
        {!isEmpty && (
          <div className="mx-auto flex w-full max-w-[44.5rem] flex-col gap-[1.375rem]">
            {messages.map((message) => (
              <WidgetMessageView
                key={message.id}
                message={message}
                reasoningVisibility={reasoningVisibility}
              />
            ))}
            {errorMessage && (
              <WidgetError message={errorMessage} onDismiss={onDismissError} onRetry={onRetry} />
            )}
          </div>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
};

// Placeholder shown while a selected conversation's history loads, so the empty-state
// greeting does not flash before the messages arrive.
const ConversationSkeleton = () => (
  <div
    aria-hidden="true"
    className="mx-auto flex w-full max-w-[44.5rem] animate-pulse flex-col gap-[1.375rem]"
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

// Inline error card shown at the end of the conversation after a failed turn. Reads as
// a calm muted card (not a destructive banner) and offers an in-place retry.
export const WidgetError = ({
  message,
  onDismiss,
  onRetry,
}: {
  readonly message: string;
  readonly onDismiss: () => void;
  readonly onRetry: () => void;
}) => (
  <div
    className="flex flex-col gap-3 rounded-lg border border-border bg-muted px-4 py-3.5"
    role="alert"
  >
    <div className="flex items-start gap-2.5">
      <CircleAlertIcon className="mt-px size-4 shrink-0 text-destructive/70" />
      <span className="min-w-0 flex-1 text-[0.84rem] text-foreground leading-snug">{message}</span>
      <Button
        aria-label="Dismiss error"
        className="-mt-1 -mr-1 text-muted-foreground"
        onClick={onDismiss}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
    <Button
      className="size-auto self-start gap-1.5 bg-card px-3 py-1.5 text-[0.78rem]"
      onClick={onRetry}
      type="button"
      variant="outline"
    >
      <RotateCwIcon className="size-3.5 text-muted-foreground" />
      Try again
    </Button>
  </div>
);
