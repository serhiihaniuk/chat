import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "#shared/ai/conversation";
import { Button } from "#shared/ui/button";
import { XIcon } from "lucide-react";

import { WidgetMessageView } from "./widget-message-view.js";
import type { WidgetMessage } from "#entities/chat";

export const WidgetConversation = ({
  messages,
}: {
  readonly messages: readonly WidgetMessage[];
}) => (
  <Conversation className="min-h-0">
    <ConversationContent>
      {messages.length === 0 ? (
        <ConversationEmptyState
          description="Start a conversation to see messages here"
          title="No messages yet"
        />
      ) : (
        messages.map((message) => <WidgetMessageView key={message.id} message={message} />)
      )}
    </ConversationContent>
    <ConversationScrollButton />
  </Conversation>
);

export const WidgetError = ({
  message,
  onDismiss,
}: {
  readonly message: string | undefined;
  readonly onDismiss: () => void;
}) =>
  message ? (
    <div
      className="mx-3 mb-2 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm"
      role="alert"
    >
      <span className="min-w-0 flex-1">{message}</span>
      <Button
        aria-label="Dismiss error"
        className="-my-1 -mr-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onDismiss}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  ) : null;
