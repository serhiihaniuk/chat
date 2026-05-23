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
  readonly state: WidgetState;
};

export const ConversationFeed = ({ state }: ConversationFeedProps) => (
  <Conversation className="side-chat-feed">
    <ConversationContent>
      {shouldShowConversationEmptyState(state) ? <ConversationEmpty /> : null}
      {state.messages.map((message) => (
        <MessageRow key={message.id} message={message} />
      ))}
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
      {hasConversationError(state) ? (
        <ConversationError message={state.errorMessage ?? "Request failed"} />
      ) : null}
    </ConversationContent>
  </Conversation>
);
