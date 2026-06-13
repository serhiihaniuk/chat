import { Effect } from "effect";
import { assertWorkspaceAuthority, type AuthContext } from "#domain/authority";
import {
  PARTNER_AI_CORE_ERROR_CODES,
  mapAuthorityDenialToError,
  type PartnerAiCoreError as PartnerAiCoreErrorType,
} from "#errors";
import { createRequestCorrelation } from "#services/observability";
import { STREAM_CHAT_FAILURES, mapPortFailure } from "../errors/effect-failures.js";
import { recordStreamObservationEffect } from "../observability/stream-chat-observability.js";
import type {
  PreparedStreamChatTurn,
  StreamChatInput,
  StreamChatPorts,
} from "../stream-chat-types.js";
import { runTurnGuards } from "../guards/run-turn-guards.js";
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
    // Prove caller authority before any product state changes.
    const authContext = yield* resolveAuthorizedContext(input);
    const correlation = createRequestCorrelation({
      requestId: input.request.requestId,
      ...(input.traceId ? { traceId: input.traceId } : {}),
    });
    const startedAt = ports.clock.now();

    // Record receipt before later stages mutate product state.
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

    // Resolve the per-turn allowlist.
    const turnPlan = yield* resolveAllowedTurnPlan(ports, input, authContext);

    // Block unsafe prompts before private context or runtime tools are exposed.
    const turnGuardDecisions = yield* runTurnGuards({
      registry: ports.turnGuards,
      streamInput: input,
      authContext,
      turnPlan,
    });

    // Attach the user-visible message to an authorized conversation.
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

    const userMessage = yield* mapPortFailure(
      ports.conversations.appendUserMessage({
        authContext,
        conversationId: conversation.conversationId,
        message: input.request.message,
      }),
      STREAM_CHAT_FAILURES.PERSISTENCE,
    );

    // Create the durable record that streamed output attaches to.
    const assistantTurn = yield* mapPortFailure(
      ports.assistantTurns.startAssistantTurn({
        authContext,
        conversation,
        userMessage,
        request: input.request,
        profileId: turnPlan.policyDecision.profileId,
        profileVersion: turnPlan.policyDecision.profileVersion,
        systemPromptId: turnPlan.profile.systemPromptId,
        manifestHash: turnPlan.manifestHash,
        providerId: turnPlan.policyDecision.providerId,
        modelId: turnPlan.policyDecision.modelId,
        now: ports.clock.now(),
      }),
      STREAM_CHAT_FAILURES.PERSISTENCE,
    );

    // Prepare and persist the model-visible context snapshot.
    const preparedContext = yield* failStartedTurnOnError(
      ports,
      authContext,
      assistantTurn.assistantTurnId,
      mapPortFailure(
        ports.contextManager.prepareTurnContext({
          authContext,
          workspace: input.workspace,
          request: input.request,
          manifest: turnPlan.manifest,
          policyDecision: turnPlan.policyDecision,
          now: ports.clock.now(),
        }),
        STREAM_CHAT_FAILURES.CONTEXT,
      ),
    );
    yield* failStartedTurnOnError(
      ports,
      authContext,
      assistantTurn.assistantTurnId,
      mapPortFailure(
        ports.assistantTurns.recordContextSnapshot({
          authContext,
          assistantTurnId: assistantTurn.assistantTurnId,
          preparedContext,
          hostContext: input.request.hostContext,
          manifestHash: turnPlan.manifestHash,
          now: ports.clock.now(),
        }),
        STREAM_CHAT_FAILURES.PERSISTENCE,
      ),
    );

    // Mark pre-start preparation complete; protocol streaming can now open.
    yield* recordStreamObservationEffect(ports.observability, {
      correlation,
      lifecycleState: "started",
      assistantTurnId: assistantTurn.assistantTurnId,
      providerId: turnPlan.policyDecision.providerId,
      modelId: turnPlan.policyDecision.modelId,
      startedAt,
      now: ports.clock.now(),
      attributes: {
        requestId: input.request.requestId,
        assistantTurnId: assistantTurn.assistantTurnId,
        providerId: turnPlan.policyDecision.providerId,
        modelId: turnPlan.policyDecision.modelId,
        profileId: turnPlan.policyDecision.profileId,
        contextManifestHash: preparedContext.contextBoard.manifest.manifestHash,
        prompt: input.request.message.content,
      },
    });

    return {
      authContext,
      correlation,
      startedAt,
      conversation,
      userMessage,
      assistantTurn,
      assistantTurnId: assistantTurn.assistantTurnId,
      manifestHash: turnPlan.manifestHash,
      policyDecision: turnPlan.policyDecision,
      turnGuardDecisions,
      preparedContext,
    };
  });

const failStartedTurnOnError = <A>(
  ports: StreamChatPorts,
  authContext: AuthContext,
  assistantTurnId: string,
  effect: Effect.Effect<A, PartnerAiCoreErrorType>,
): Effect.Effect<A, PartnerAiCoreErrorType> =>
  effect.pipe(
    Effect.catch((error: PartnerAiCoreErrorType) =>
      markStartedTurnFailed(ports, authContext, assistantTurnId, error).pipe(
        Effect.andThen(Effect.fail(error)),
      ),
    ),
  );

const markStartedTurnFailed = (
  ports: StreamChatPorts,
  authContext: AuthContext,
  assistantTurnId: string,
  error: PartnerAiCoreErrorType,
): Effect.Effect<void, PartnerAiCoreErrorType> =>
  mapPortFailure(
    ports.assistantTurns.failAssistantTurn({
      authContext,
      assistantTurnId,
      status:
        error.code === PARTNER_AI_CORE_ERROR_CODES.PERSISTENCE_FAILED
          ? "persistence_failed"
          : "provider_failed",
      errorCode: error.protocolCode,
      now: ports.clock.now(),
    }),
    STREAM_CHAT_FAILURES.PERSISTENCE,
  );

const resolveAuthorizedContext = (
  input: StreamChatInput,
): Effect.Effect<AuthContext, PartnerAiCoreErrorType> =>
  Effect.gen(function* () {
    const authorityDecision = assertWorkspaceAuthority(input.authContext, input.workspace);
    if (!authorityDecision.allowed) {
      return yield* Effect.fail(
        mapAuthorityDenialToError(authorityDecision.code, authorityDecision.message),
      );
    }

    return authorityDecision.authContext;
  });
