import type { SideChatError } from "../hooks/use-side-chat.js";
import type { WidgetMessage } from "../hooks/use-side-chat-events.js";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  ConversationScrollToBottomSignal,
} from "../components/ai-elements/Conversation.js";
import { RenderedChatMessage } from "./RenderedChatMessage.js";

export type ConversationPanelProps = {
  activeAssistantMessageId?: string;
  apiEndpoint: string;
  error?: SideChatError;
  historyStatus: "idle" | "loading" | "loaded" | "empty" | "error";
  isHistoryLoading: boolean;
  isStreaming: boolean;
  messages: WidgetMessage[];
  scrollToBottomSignal: number;
};

export const ConversationPanel = ({
  activeAssistantMessageId,
  apiEndpoint,
  historyStatus,
  isHistoryLoading,
  isStreaming,
  messages,
  scrollToBottomSignal,
}: ConversationPanelProps) => (
  <Conversation className="sidechat-conversation mx-auto mt-4 w-full max-w-3xl px-8 max-sm:px-4">
    <ConversationContent className="min-h-full gap-6 px-0 pt-0 pb-5">
      {isHistoryLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading conversation history...
        </p>
      ) : null}
      {historyStatus === "loaded" ? (
        <p className="m-0 self-start rounded border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground">
          Loaded conversation history.
        </p>
      ) : null}
      {historyStatus === "empty" ? (
        <p className="m-0 self-start rounded border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground">
          No prior messages in this conversation.
        </p>
      ) : null}
      {messages.length === 0 ? (
        <ConversationEmptyState
          className="rounded-md border border-dashed border-border bg-background text-muted-foreground"
          description="Ask a question about this workspace, switch models, or try a markdown-heavy prompt."
          title="How can I help?"
        />
      ) : (
        messages.map((message) => (
          <RenderedChatMessage
            activeAssistantMessageId={activeAssistantMessageId}
            apiEndpoint={apiEndpoint}
            isStreaming={isStreaming}
            key={message.id}
            message={message}
          />
        ))
      )}
    </ConversationContent>
    <ConversationScrollToBottomSignal signal={scrollToBottomSignal} />
    <ConversationScrollButton />
  </Conversation>
);
