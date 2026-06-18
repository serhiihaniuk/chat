import type { AiRuntimeMessage, AiRuntimeRequest } from "@side-chat/ai-runtime-contract";
import type { PreparedStreamChatTurn, StreamChatInput } from "../stream-chat-types.js";
import { renderContextBoardMessage } from "./render-context-board-message.js";

/**
 * Build the final provider-neutral runtime request for one assistant turn.
 *
 * Source is the prepared turn (resolved policy decision plus prepared context)
 * and the parsed browser request. Target is agent-runtime's `AiRuntimeRequest`.
 *
 * Invariant: core is the only place that assembles final model messages, so the
 * runtime receives `messages` as-is and can never prepend system instructions,
 * a context board, or the current user message.
 */
export const buildModelTurnRequest = (
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
): AiRuntimeRequest => ({
  requestId: input.request.requestId,
  assistantTurnId: turn.assistantTurnId,
  executorId: turn.policyDecision.executorId,
  providerId: turn.policyDecision.providerId,
  modelId: turn.policyDecision.modelId,
  reasoning: turn.policyDecision.reasoning,
  messages: buildModelMessages(turn),
  toolNames: turn.policyDecision.allowedToolNames,
  toolScope: {
    hostAppId: input.hostAppId,
    workspaceId: turn.authContext.workspaceId,
    subjectId: turn.authContext.subject.subjectId,
    conversationId: turn.conversation.conversationId,
    assistantTurnId: turn.assistantTurnId,
    allowedHostCommandNames: turn.policyDecision.allowedCommandNames,
  },
  abortSignal: input.abortSignal,
});

/**
 * Assemble the final model message list in deterministic order.
 *
 * Order is system instructions, optional context board, then the prepared
 * conversation messages (admitted history followed by the current user
 * message). The current message reaches core as user content only; its role is
 * `user` here, never a client-chosen role.
 */
const buildModelMessages = (turn: PreparedStreamChatTurn): readonly AiRuntimeMessage[] => {
  const contextBoardMessage = renderContextBoardMessage(turn.preparedContext.contextBoard);
  return [
    { role: "system", content: turn.policyDecision.systemInstructions },
    ...(contextBoardMessage ? [contextBoardMessage] : []),
    ...turn.preparedContext.runtimeMessages,
  ];
};
