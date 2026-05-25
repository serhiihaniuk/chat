import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "#shared/ai/conversation";

import { WidgetMessageView } from "./widget-message-view.js";
import type { WidgetMessage } from "./widget.types.js";

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
        messages.map((message) => (
          <WidgetMessageView key={message.id} message={message} />
        ))
      )}
    </ConversationContent>
    <ConversationScrollButton />
  </Conversation>
);

export const WidgetError = ({
  message,
}: {
  readonly message: string | undefined;
}) =>
  message ? (
    <div
      className="mx-3 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm"
      role="alert"
    >
      {message}
    </div>
  ) : null;
