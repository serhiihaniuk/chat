import { Effect } from "effect";
import type { AuthContext } from "#domain/authority";
import {
  conversationBusyError,
  STREAM_CHAT_FAILURES,
  mapPortFailure,
  type PartnerAiCoreError as PartnerAiCoreErrorType,
} from "#errors";
import type { ConversationRef } from "#ports";
import type {
  PreparedStreamChatTurn,
  StreamChatInput,
  StreamChatPorts,
} from "../stream-chat-types.js";
import {
  appendUserMessage,
  createStreamChatRequestScope,
  ensureAuthorizedConversation,
  prepareAndRecordTurnContext,
  recordReceivedStreamRequest,
  recordStartedStreamTurn,
  resolveAuthorizedContext,
  runSelectedTurnGuards,
  startAssistantTurnRecord,
  toPreparedStreamChatTurn,
} from "./stream-chat-turn-prestart-lifecycle.js";
import { resolveAllowedTurnPlan } from "./turn-policy-plan.js";

/**
 * Reject a second concurrent run in one conversation before any durable write.
 *
 * A running turn from a different request means another tab or client is
 * mid-turn — fail `conversation_busy` (409). A running turn from this same
 * request is this request's own idempotent retry, so it passes through to the
 * get-or-create turn insert. Best-effort: two simultaneous fresh requests can
 * still both pass, which lease fencing and the reaper tolerate.
 */
const guardConcurrentConversationTurn = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  authContext: AuthContext,
  conversation: ConversationRef,
): Effect.Effect<void, PartnerAiCoreErrorType> =>
  Effect.gen(function* () {
    const active = yield* mapPortFailure(
      ports.assistantTurns.findActiveConversationTurn({
        authContext,
        conversationId: conversation.conversationId,
      }),
      STREAM_CHAT_FAILURES.PERSISTENCE,
    );
    if (active && active.requestId !== input.request.requestId) {
      return yield* Effect.fail(conversationBusyError());
    }
  });

/**
 * Prepare everything that must succeed before the browser sees `started`.
 *
 * Everything in this function finishes before the protocol stream opens. If a
 * step fails, the HTTP adapter can reject setup instead of half-opening an SSE
 * response.
 */
export const prepareStreamChatTurn = (
  ports: StreamChatPorts,
  input: StreamChatInput,
): Effect.Effect<PreparedStreamChatTurn, PartnerAiCoreErrorType> =>
  Effect.gen(function* () {
    // Prove the host app allows this subject to act in the requested workspace.
    const authContext = yield* resolveAuthorizedContext(input);

    // Create the request-level correlation used by observations and persisted records.
    const requestScope = createStreamChatRequestScope(ports, input);

    // Record that the request was received before any agent/runtime work can start.
    yield* recordReceivedStreamRequest(ports, input, authContext, requestScope);

    // Choose the profile, tools, guards, and executor for this turn.
    const turnPlan = yield* resolveAllowedTurnPlan(ports, input, authContext);

    // Block unsafe prompts before private tools or the main executor are exposed.
    const turnGuardDecisions = yield* runSelectedTurnGuards(ports, input, authContext, turnPlan);

    // Load or create only the conversation this subject may access.
    const conversation = yield* ensureAuthorizedConversation(ports, input, authContext);

    // Reject a second concurrent run in this conversation (a different tab/client)
    // before any durable write; this request's own idempotent retry passes through.
    yield* guardConcurrentConversationTurn(ports, input, authContext, conversation);

    // Store the user-visible message that starts this assistant turn.
    const userMessage = yield* appendUserMessage(ports, input, authContext, conversation);

    // Create the assistant turn record that streamed runtime/protocol events attach to.
    const assistantTurn = yield* startAssistantTurnRecord(
      ports,
      input,
      authContext,
      turnPlan,
      conversation,
      userMessage,
    );

    // Gather host context and tool context into a model-ready board.
    const preparedContext = yield* prepareAndRecordTurnContext(ports, input, {
      authContext,
      conversation,
      userMessage,
      assistantTurn,
      turnPlan,
    });

    // Mark the stream as startable after all durable pre-start setup has succeeded.
    yield* recordStartedStreamTurn(
      ports,
      input,
      requestScope,
      turnPlan,
      assistantTurn,
      preparedContext,
    );

    return toPreparedStreamChatTurn({
      requestScope,
      authContext,
      turnPlan,
      turnGuardDecisions,
      conversation,
      userMessage,
      assistantTurn,
      preparedContext,
    });
  });
