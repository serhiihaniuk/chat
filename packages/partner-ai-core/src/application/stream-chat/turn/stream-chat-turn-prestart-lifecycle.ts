import { optionalField } from "@side-chat/shared";
import { Effect } from "effect";
import { assertWorkspaceAuthority, type AuthContext } from "#domain/authority";
import type { PreparedTurnContext } from "#domain/capabilities";
import {
  PARTNER_AI_CORE_ERROR_CODES,
  mapAuthorityDenialToError,
  type PartnerAiCoreError as PartnerAiCoreErrorType,
} from "#errors";
import type { AssistantTurnRef, ConversationRef, MessageRef, TurnGuardDecision } from "#ports";
import { createRequestCorrelation, type RequestCorrelation } from "#services/observability";
import { STREAM_CHAT_FAILURES, mapPortFailure } from "../errors/effect-failures.js";
import { runTurnGuards } from "../guards/run-turn-guards.js";
import { recordStreamObservationEffect } from "../observability/stream-chat-observability.js";
import type {
  PreparedStreamChatTurn,
  StreamChatInput,
  StreamChatPorts,
} from "../stream-chat-types.js";
import type { ResolvedTurnPlan } from "./turn-policy-plan.js";

export type StreamChatRequestScope = {
  readonly correlation: RequestCorrelation;
  readonly startedAt: string;
};

type PreparedContextInput = {
  readonly authContext: AuthContext;
  readonly conversation: ConversationRef;
  readonly userMessage: MessageRef;
  readonly assistantTurn: AssistantTurnRef;
  readonly turnPlan: ResolvedTurnPlan;
};

type PreparedTurnInput = PreparedContextInput & {
  readonly requestScope: StreamChatRequestScope;
  readonly turnGuardDecisions: readonly TurnGuardDecision[];
  readonly preparedContext: PreparedTurnContext;
};

export const resolveAuthorizedContext = (
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

export const createStreamChatRequestScope = (
  ports: StreamChatPorts,
  input: StreamChatInput,
): StreamChatRequestScope => ({
  correlation: createRequestCorrelation({
    requestId: input.request.requestId,
    ...optionalField("traceId", input.traceId || undefined),
  }),
  startedAt: ports.clock.now(),
});

export const recordReceivedStreamRequest = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  authContext: AuthContext,
  requestScope: StreamChatRequestScope,
): Effect.Effect<void, PartnerAiCoreErrorType> =>
  recordStreamObservationEffect(ports.observability, {
    correlation: requestScope.correlation,
    lifecycleState: "received",
    startedAt: requestScope.startedAt,
    now: requestScope.startedAt,
    attributes: {
      requestId: input.request.requestId,
      message: input.request.message,
      authSource: authContext.source,
      subjectId: authContext.subject.subjectId,
    },
  });

export const runSelectedTurnGuards = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  authContext: AuthContext,
  turnPlan: ResolvedTurnPlan,
): Effect.Effect<readonly TurnGuardDecision[], PartnerAiCoreErrorType> =>
  runTurnGuards({
    registry: ports.turnGuards,
    streamInput: input,
    authContext,
    turnPlan,
  });

export const ensureAuthorizedConversation = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  authContext: AuthContext,
): Effect.Effect<ConversationRef, PartnerAiCoreErrorType> =>
  Effect.gen(function* () {
    const conversation = yield* mapPortFailure(
      ports.conversations.ensureConversation({
        authContext,
        ...optionalField("requestedConversationId", input.request.conversationId || undefined),
        fallbackConversationId: ports.ids.nextConversationId(),
      }),
      STREAM_CHAT_FAILURES.PERSISTENCE,
    );
    const conversationDecision = assertWorkspaceAuthority(authContext, conversation);
    if (conversationDecision.allowed) return conversation;

    return yield* Effect.fail(
      mapAuthorityDenialToError(conversationDecision.code, conversationDecision.message),
    );
  });

export const appendUserMessage = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  authContext: AuthContext,
  conversation: ConversationRef,
): Effect.Effect<MessageRef, PartnerAiCoreErrorType> =>
  mapPortFailure(
    ports.conversations.appendUserMessage({
      authContext,
      conversationId: conversation.conversationId,
      message: input.request.message,
    }),
    STREAM_CHAT_FAILURES.PERSISTENCE,
  );

export const startAssistantTurnRecord = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  authContext: AuthContext,
  turnPlan: ResolvedTurnPlan,
  conversation: ConversationRef,
  userMessage: MessageRef,
): Effect.Effect<AssistantTurnRef, PartnerAiCoreErrorType> =>
  mapPortFailure(
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

export const prepareAndRecordTurnContext = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  contextInput: PreparedContextInput,
): Effect.Effect<PreparedTurnContext, PartnerAiCoreErrorType> =>
  Effect.gen(function* () {
    const preparedContext = yield* failStartedTurnOnError(
      ports,
      contextInput.authContext,
      contextInput.assistantTurn.assistantTurnId,
      mapPortFailure(
        ports.contextManager.prepareTurnContext({
          authContext: contextInput.authContext,
          workspace: input.workspace,
          conversation: contextInput.conversation,
          request: input.request,
          manifest: contextInput.turnPlan.manifest,
          policyDecision: contextInput.turnPlan.policyDecision,
          now: ports.clock.now(),
          ...optionalField("abortSignal", input.abortSignal),
        }),
        STREAM_CHAT_FAILURES.CONTEXT,
      ),
    );
    yield* recordPreparedContextSnapshot(ports, input, contextInput, preparedContext);

    return preparedContext;
  });

const recordPreparedContextSnapshot = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  contextInput: PreparedContextInput,
  preparedContext: PreparedTurnContext,
): Effect.Effect<void, PartnerAiCoreErrorType> =>
  failStartedTurnOnError(
    ports,
    contextInput.authContext,
    contextInput.assistantTurn.assistantTurnId,
    mapPortFailure(
      ports.assistantTurns.recordContextSnapshot({
        authContext: contextInput.authContext,
        assistantTurnId: contextInput.assistantTurn.assistantTurnId,
        preparedContext,
        hostContext: input.request.hostContext,
        manifestHash: contextInput.turnPlan.manifestHash,
        now: ports.clock.now(),
      }),
      STREAM_CHAT_FAILURES.PERSISTENCE,
    ),
  );

export const recordStartedStreamTurn = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  requestScope: StreamChatRequestScope,
  turnPlan: ResolvedTurnPlan,
  assistantTurn: AssistantTurnRef,
  preparedContext: PreparedTurnContext,
): Effect.Effect<void, PartnerAiCoreErrorType> =>
  recordStreamObservationEffect(ports.observability, {
    correlation: requestScope.correlation,
    lifecycleState: "started",
    assistantTurnId: assistantTurn.assistantTurnId,
    providerId: turnPlan.policyDecision.providerId,
    modelId: turnPlan.policyDecision.modelId,
    startedAt: requestScope.startedAt,
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

export const toPreparedStreamChatTurn = (input: PreparedTurnInput): PreparedStreamChatTurn => ({
  authContext: input.authContext,
  correlation: input.requestScope.correlation,
  startedAt: input.requestScope.startedAt,
  conversation: input.conversation,
  userMessage: input.userMessage,
  assistantTurn: input.assistantTurn,
  assistantTurnId: input.assistantTurn.assistantTurnId,
  manifestHash: input.turnPlan.manifestHash,
  policyDecision: input.turnPlan.policyDecision,
  turnGuardDecisions: input.turnGuardDecisions,
  preparedContext: input.preparedContext,
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
