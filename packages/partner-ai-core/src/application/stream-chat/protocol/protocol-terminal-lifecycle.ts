import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  type CompletedEvent,
  type DeltaEvent,
  type ProtocolErrorCode,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import { Effect, Ref } from "effect";
import {
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
} from "#errors";
import type { AssistantTurnFailureStatus } from "#ports";
import { terminalErrorCode } from "#services/stream-observability";
import { STREAM_CHAT_FAILURES, mapPortFailure, mapSyncFailure } from "../errors/effect-failures.js";
import { validateExactlyOneTerminal } from "./runtime-event-mapper.js";
import { recordStreamObservationEffect } from "../observability/stream-chat-observability.js";
import { recordAllowedMemoryWriteCandidates } from "../memory/record-allowed-memory-write-candidates.js";
import type {
  PreparedStreamChatTurn,
  StreamChatInput,
  StreamChatPorts,
} from "../stream-chat-types.js";

export const finalizeProtocolStream = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  emitted: Ref.Ref<SidechatStreamEvent[]>,
): Effect.Effect<void, PartnerAiCoreError> =>
  Effect.gen(function* () {
    const events = yield* Ref.get(emitted);
    yield* validateTerminalOrFailTurn(ports, turn, events);
    const terminalCode = terminalErrorCode(events);
    if (turn.assistantTurn.status === "running") {
      if (terminalCode) {
        yield* failAssistantTurnFromTerminal(ports, turn, terminalCode);
      } else {
        yield* completeAssistantTurnFromEvents(ports, input, turn, events);
      }
    }
    yield* recordStreamObservationEffect(ports.observability, {
      correlation: turn.correlation,
      lifecycleState: terminalCode ? "failed" : "completed",
      assistantTurnId: turn.assistantTurnId,
      providerId: turn.policyDecision.providerId,
      modelId: turn.policyDecision.modelId,
      ...(terminalCode ? { errorCode: terminalCode } : {}),
      startedAt: turn.startedAt,
      now: ports.clock.now(),
      attributes: { eventCount: events.length },
    });
  });

const validateTerminalOrFailTurn = (
  ports: StreamChatPorts,
  turn: PreparedStreamChatTurn,
  events: readonly SidechatStreamEvent[],
): Effect.Effect<void, PartnerAiCoreError> =>
  mapSyncFailure(
    () => validateExactlyOneTerminal(events),
    STREAM_CHAT_FAILURES.INVALID_RUNTIME_SEQUENCE,
  ).pipe(
    Effect.catch((error: PartnerAiCoreError) =>
      (turn.assistantTurn.status === "running"
        ? mapPortFailure(
            ports.assistantTurns.failAssistantTurn({
              authContext: turn.authContext,
              assistantTurnId: turn.assistantTurnId,
              status: "provider_failed",
              errorCode: error.protocolCode,
              now: ports.clock.now(),
            }),
            STREAM_CHAT_FAILURES.PERSISTENCE,
          )
        : Effect.void
      ).pipe(Effect.andThen(Effect.fail(error))),
    ),
  );

const completeAssistantTurnFromEvents = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  events: readonly SidechatStreamEvent[],
): Effect.Effect<void, PartnerAiCoreError> => {
  const completed = events.find(isCompletedEvent);
  if (!completed) {
    return Effect.fail(
      new PartnerAiCoreError(
        PARTNER_AI_CORE_ERROR_CODES.INVALID_RUNTIME_SEQUENCE,
        "Stream completed without a terminal completion event.",
        PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.MALFORMED_STREAM,
      ),
    );
  }

  const assistantContent = assistantContentFromEvents(events);

  return Effect.gen(function* () {
    yield* mapPortFailure(
      ports.assistantTurns.completeAssistantTurn({
        authContext: turn.authContext,
        conversation: turn.conversation,
        request: input.request,
        assistantTurnId: turn.assistantTurnId,
        assistantContent,
        finishReason: completed.finishReason,
        ...(completed.usage ? { usage: completed.usage } : {}),
        providerId: turn.policyDecision.providerId,
        modelId: turn.policyDecision.modelId,
        now: completed.createdAt,
      }),
      STREAM_CHAT_FAILURES.PERSISTENCE,
    );

    yield* recordMemoryWriteCandidatesAfterCompletion(ports, input, turn, assistantContent);
  });
};

const assistantContentFromEvents = (events: readonly SidechatStreamEvent[]): string =>
  events
    .filter(isDeltaEvent)
    .map((event) => event.content)
    .join("");

const recordMemoryWriteCandidatesAfterCompletion = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  assistantContent: string,
): Effect.Effect<void, PartnerAiCoreError> =>
  recordAllowedMemoryWriteCandidates({
    memory: ports.memory,
    authContext: turn.authContext,
    workspace: input.workspace,
    request: input.request,
    conversation: turn.conversation,
    assistantTurnId: turn.assistantTurnId,
    policyDecision: turn.policyDecision,
    assistantContent,
  }).pipe(
    Effect.flatMap((candidates) =>
      candidates.length > 0
        ? recordMemoryWriteCandidateObservation(ports, turn, "recorded", candidates.length)
        : Effect.void,
    ),
    Effect.catch((error: PartnerAiCoreError) =>
      recordMemoryWriteCandidateObservation(ports, turn, "failed", 0, error).pipe(
        Effect.catch(() => Effect.void),
      ),
    ),
  );

const recordMemoryWriteCandidateObservation = (
  ports: StreamChatPorts,
  turn: PreparedStreamChatTurn,
  status: "recorded" | "failed",
  candidateCount: number,
  error?: PartnerAiCoreError,
): Effect.Effect<void, PartnerAiCoreError> =>
  recordStreamObservationEffect(
    ports.observability,
    createMemoryWriteCandidateObservationInput(ports, turn, status, candidateCount, error),
  );

const createMemoryWriteCandidateObservationInput = (
  ports: StreamChatPorts,
  turn: PreparedStreamChatTurn,
  status: "recorded" | "failed",
  candidateCount: number,
  error: PartnerAiCoreError | undefined,
): Parameters<typeof recordStreamObservationEffect>[1] => {
  const input: Parameters<typeof recordStreamObservationEffect>[1] = {
    correlation: turn.correlation,
    lifecycleState: "completed",
    assistantTurnId: turn.assistantTurnId,
    providerId: turn.policyDecision.providerId,
    modelId: turn.policyDecision.modelId,
    startedAt: turn.startedAt,
    now: ports.clock.now(),
    attributes: {
      stage: "memory_write_candidates",
      status,
      candidateCount,
    },
  };
  if (!error) return input;

  return {
    ...input,
    errorCode: error.protocolCode,
    attributes: {
      ...input.attributes,
      errorCode: error.protocolCode,
      message: error.message,
    },
  };
};

const failAssistantTurnFromTerminal = (
  ports: StreamChatPorts,
  turn: PreparedStreamChatTurn,
  errorCode: ProtocolErrorCode,
): Effect.Effect<void, PartnerAiCoreError> =>
  mapPortFailure(
    ports.assistantTurns.failAssistantTurn({
      authContext: turn.authContext,
      assistantTurnId: turn.assistantTurnId,
      status: failureStatusForProtocolCode(errorCode),
      errorCode,
      now: ports.clock.now(),
    }),
    STREAM_CHAT_FAILURES.PERSISTENCE,
  );

const isDeltaEvent = (event: SidechatStreamEvent): event is DeltaEvent =>
  event.type === SIDECHAT_EVENT_TYPES.DELTA;

const isCompletedEvent = (event: SidechatStreamEvent): event is CompletedEvent =>
  event.type === SIDECHAT_EVENT_TYPES.COMPLETED;

const failureStatusForProtocolCode = (code: ProtocolErrorCode): AssistantTurnFailureStatus => {
  if (code === PROTOCOL_ERROR_CODES.ABORTED) return "user_aborted";
  if (code === PROTOCOL_ERROR_CODES.TIMEOUT) return "timed_out";
  if (code === PROTOCOL_ERROR_CODES.TOOL_FAILED) return "tool_failed";
  return "provider_failed";
};
