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
 *
 * The generation `abortSignal` is intentionally not set here: the server-owned
 * runner is decoupled from any caller signal, so provider abort is driven by
 * fiber interruption and the signal is applied at the single open-stream call
 * site (`protocol-event-stream.ts`).
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
  // The runtime allowlist is the turn profile's tools, narrowed to the user's
  // per-turn selection from the composer tools menu (request.enabledToolNames).
  toolNames: gateToolNames(turn.policyDecision.allowedToolNames, input.request.enabledToolNames),
  toolScope: {
    hostAppId: input.hostAppId,
    workspaceId: turn.authContext.workspaceId,
    subjectId: turn.authContext.subject.subjectId,
    conversationId: turn.conversation.conversationId,
    assistantTurnId: turn.assistantTurnId,
    // Host commands are host-owned and vary by page, so they ride in per turn on
    // the request (the host declares them via the bridge) rather than from server
    // config. Pure relay: the runtime exposes exactly what the host declared.
    hostCommands: input.request.hostCommands,
  },
});

/**
 * Narrow the profile's tool allowlist to the user's per-turn selection.
 *
 * `enabledToolNames` absent → the profile default. Present → the intersection, so
 * the composer menu can turn a profile tool off but never grant one the profile
 * does not already allow (the profile stays the security upper bound).
 */
const gateToolNames = (
  allowed: readonly string[],
  enabled: readonly string[] | undefined,
): readonly string[] => {
  if (enabled === undefined) return allowed;
  const enabledSet = new Set(enabled);
  return allowed.filter((name) => enabledSet.has(name));
};

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
