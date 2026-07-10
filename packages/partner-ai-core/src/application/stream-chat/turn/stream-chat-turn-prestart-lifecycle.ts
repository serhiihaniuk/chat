import { Effect } from "effect";
import { assertWorkspaceAuthority, type AuthContext } from "#domain/authority";
import type { PreparedTurnContext } from "#domain/capabilities-contract";
import {
  STREAM_CHAT_FAILURES,
  mapAuthorityDenialToError,
  mapPortFailure,
  type PartnerAiCoreError as PartnerAiCoreErrorType,
} from "#errors";
import type { AssistantTurnRef, ConversationRef, MessageRef, TurnGuardDecision } from "#ports";
import { createRequestCorrelation, type RequestCorrelation } from "#services/observability";
import { runTurnGuards } from "../run-turn-guards.js";
import { recordStreamObservationEffect } from "../stream-chat-observability.js";
import type {
  PreparedStreamChatTurn,
  StreamChatInput,
  StreamChatPorts,
} from "../stream-chat-types.js";
import type { ResolvedTurnPlan } from "./turn-policy-plan.js";
import { failStartedTurnOnError } from "./started-turn-failure.js";

/**
 * Named pre-start stages used by `prepareStreamChatTurn`.
 *
 * These helpers prove authority and policy, create the durable conversation,
 * message, and turn records, prepare context, and record server observability.
 * They neither open the runtime stream nor emit browser protocol events; those
 * responsibilities begin only after this lifecycle returns a prepared turn.
 */

/** Request-level timing and correlation captured before durable setup starts. */
export type StreamChatRequestScope = {
  readonly correlation: RequestCorrelation;
  /** Server receipt time used for end-to-end latency, not `sidechat.started` time. */
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
    traceId: input.traceId,
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
        requestedConversationId: input.request.conversationId,
        fallbackConversationId: ports.ids.nextConversationId(),
        // Keyed on the request id, not the fresh fallback id, so a retried
        // conversationless POST converges on one conversation instead of orphaning.
        fallbackConversationKey: `conversationless:${input.request.requestId}`,
        now: ports.clock.now(),
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
      now: ports.clock.now(),
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
          currentUserMessage: contextInput.userMessage,
          request: input.request,
          manifest: contextInput.turnPlan.manifest,
          policyDecision: contextInput.turnPlan.policyDecision,
          now: ports.clock.now(),
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
  // This is the server-side "prepared and ready" observation. The protocol
  // stream emits `sidechat.started` later, after preparation returns and before
  // the runtime stream is drained.
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
