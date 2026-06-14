import { Effect } from "effect";
import type { PartnerAiCoreError as PartnerAiCoreErrorType } from "#errors";
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

    // Choose the profile, tools, guards, RAG sources, memory policy, and executor for this turn.
    const turnPlan = yield* resolveAllowedTurnPlan(ports, input, authContext);

    // Block unsafe prompts before private memory, RAG, tools, or the main executor are exposed.
    const turnGuardDecisions = yield* runSelectedTurnGuards(ports, input, authContext, turnPlan);

    // Load or create only the conversation this subject may access.
    const conversation = yield* ensureAuthorizedConversation(ports, input, authContext);

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

    // Gather host context, memory, RAG, research output, and tool context into a model-ready board.
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
