import { Effect } from "effect";
import { assertWorkspaceAuthority, type AuthContext } from "#domain/authority";
import { mapAuthorityDenialToError, type PartnerAiCoreError } from "#errors";
import { allowRequestPolicy, mapPolicyDenialToError } from "#policies/policy";
import { createRequestCorrelation } from "#services/observability";
import { STREAM_CHAT_FAILURES, mapPortFailure } from "./effect-failures.js";
import { recordStreamObservationEffect } from "./stream-chat-observability.js";
import type {
  PreparedStreamChatTurn,
  StreamChatInput,
  StreamChatPorts,
} from "./stream-chat-types.js";

/**
 * Prepare everything that must succeed before the browser sees `started`.
 *
 * Authorization, policy, conversation creation, user-message persistence, and
 * initial observability all happen before the protocol stream opens. If this
 * fails, the HTTP adapter can return a request-level error instead of
 * half-opening an SSE response.
 */
export const prepareStreamChatTurn = (
  ports: StreamChatPorts,
  input: StreamChatInput,
): Effect.Effect<PreparedStreamChatTurn, PartnerAiCoreError> =>
  Effect.gen(function* () {
    const authContext = yield* resolveAuthorizedContext(ports, input);
    const correlation = createRequestCorrelation({
      requestId: input.request.requestId,
      ...(input.traceId ? { traceId: input.traceId } : {}),
    });
    const startedAt = ports.clock.now();

    yield* recordStreamObservationEffect(ports.observability, {
      correlation,
      lifecycleState: "received",
      startedAt,
      now: startedAt,
      attributes: {
        requestId: input.request.requestId,
        message: input.request.message,
        authSource: authContext.source,
        subjectId: authContext.subject.subjectId,
      },
    });

    const conversation = yield* mapPortFailure(
      ports.conversations.ensureConversation({
        authContext,
        ...(input.request.conversationId
          ? { requestedConversationId: input.request.conversationId }
          : {}),
        fallbackConversationId: ports.ids.nextConversationId(),
      }),
      STREAM_CHAT_FAILURES.PERSISTENCE,
    );
    const conversationDecision = assertWorkspaceAuthority(authContext, conversation);
    if (!conversationDecision.allowed) {
      return yield* Effect.fail(
        mapAuthorityDenialToError(conversationDecision.code, conversationDecision.message),
      );
    }

    yield* mapPortFailure(
      ports.conversations.appendUserMessage({
        authContext,
        conversationId: conversation.conversationId,
        message: input.request.message,
      }),
      STREAM_CHAT_FAILURES.PERSISTENCE,
    );

    const assistantTurnId = ports.ids.nextAssistantTurnId();
    yield* recordStreamObservationEffect(ports.observability, {
      correlation,
      lifecycleState: "started",
      assistantTurnId,
      providerId: input.providerId,
      modelId: input.modelId,
      startedAt,
      now: ports.clock.now(),
      attributes: {
        requestId: input.request.requestId,
        assistantTurnId,
        providerId: input.providerId,
        modelId: input.modelId,
        prompt: input.request.message.content,
      },
    });

    return {
      authContext,
      correlation,
      startedAt,
      conversation,
      assistantTurnId,
    };
  });

const resolveAuthorizedContext = (
  ports: StreamChatPorts,
  input: StreamChatInput,
): Effect.Effect<AuthContext, PartnerAiCoreError> =>
  Effect.gen(function* () {
    const authorityDecision = assertWorkspaceAuthority(input.authContext, input.workspace);
    if (!authorityDecision.allowed) {
      return yield* Effect.fail(
        mapAuthorityDenialToError(authorityDecision.code, authorityDecision.message),
      );
    }

    const policy = ports.policies ?? allowRequestPolicy();
    const policyDecision = yield* mapPortFailure(
      policy.evaluate({
        authContext: authorityDecision.authContext,
        workspace: input.workspace,
        request: input.request,
        providerId: input.providerId,
        modelId: input.modelId,
      }),
      STREAM_CHAT_FAILURES.POLICY,
    );
    if (!policyDecision.allowed) {
      return yield* Effect.fail(mapPolicyDenialToError(policyDecision));
    }

    return authorityDecision.authContext;
  });
