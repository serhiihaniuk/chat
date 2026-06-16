import {
  toAssistantTurnId,
  toRequestId,
  type AiRuntimeRequest,
} from "@side-chat/ai-runtime-contract";
import type { ConversationTitlePromptConfig } from "#ports";
import type { PreparedStreamChatTurn, StreamChatInput } from "../stream-chat-types.js";

type ConversationTitleRuntimeInput = {
  readonly prompt: ConversationTitlePromptConfig;
  readonly userPrompt: string;
};

export const createConversationTitleRuntimeRequest = (
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  titleInput: ConversationTitleRuntimeInput,
): AiRuntimeRequest => {
  const assistantTurnId = toAssistantTurnId(`${turn.assistantTurnId}:conversation-title`);
  return {
    requestId: toRequestId(`${input.request.requestId}:conversation-title`),
    assistantTurnId,
    executorId: turn.policyDecision.executorId,
    providerId: turn.policyDecision.providerId,
    modelId: turn.policyDecision.modelId,
    messages: [
      { role: "system", content: titleInput.prompt.systemInstructions },
      { role: "user", content: titleInput.userPrompt },
    ],
    toolNames: [],
    toolScope: {
      hostAppId: input.hostAppId,
      workspaceId: turn.authContext.workspaceId,
      subjectId: turn.authContext.subject.subjectId,
      conversationId: turn.conversation.conversationId,
      assistantTurnId,
      allowedHostCommandNames: [],
    },
    abortSignal: input.abortSignal,
  };
};
