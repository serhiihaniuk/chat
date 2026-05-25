import type { WidgetState } from "../model/conversation-state.js";
import {
  hasConversationError,
  shouldShowConversationEmptyState,
} from "../model/selectors.js";
import { ConversationEmpty } from "./conversation-empty.js";
import { ConversationError } from "./conversation-error.js";
import { HostCommandPart } from "./host-command-part.js";
import { MessageRow } from "./message-row.js";
import { ReasoningPart } from "./reasoning-part.js";
import { ToolPart } from "./tool-part.js";
import { projectHostCommandPart } from "#entities/host-command/projection";
import { projectToolPart } from "#entities/tool/projection";
import { Conversation, ConversationContent } from "#shared/ai/conversation";

export type ConversationFeedProps = {
  readonly onDismissError?: () => void;
  readonly onRetry?: () => void;
  readonly state: WidgetState;
};

export const ConversationFeed = ({
  onDismissError,
  onRetry,
  state,
}: ConversationFeedProps) => (
  <Conversation className="side-chat-feed">
    <ConversationContent>
      {state.historyStatus === "loading" ? (
        <p className="ml-[6.5rem] text-xl text-slate-500">Loading history...</p>
      ) : null}
      {shouldShowConversationEmptyState(state) ? <ConversationEmpty /> : null}
      {state.messages.map((message) => (
        <MessageRow key={message.id} message={message} />
      ))}
      {hasInlineParts(state) ? null : <DetachedParts state={state} />}
      {hasConversationError(state) ? (
        <ConversationError
          message={state.errorMessage ?? "Request failed"}
          {...(onDismissError ? { onDismiss: onDismissError } : {})}
          {...(onRetry ? { onRetry } : {})}
        />
      ) : null}
    </ConversationContent>
  </Conversation>
);

const DetachedParts = ({ state }: { readonly state: WidgetState }) => (
  <>
    {state.reasoning.map((summary, index) => (
      <ReasoningPart key={`${index}:${summary}`} summary={summary} />
    ))}
    {state.tools.map((tool) => (
      <ToolPart key={projectToolPart(tool).id} tool={tool} />
    ))}
    {state.hostCommands.map((command) => (
      <HostCommandPart
        command={command}
        key={projectHostCommandPart(command).id}
      />
    ))}
  </>
);

const hasInlineParts = (state: WidgetState): boolean =>
  state.messages.some((message) => (message.parts?.length ?? 0) > 0);
