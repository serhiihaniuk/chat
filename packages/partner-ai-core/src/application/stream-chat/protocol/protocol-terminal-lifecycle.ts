import { PROTOCOL_ERROR_CODES, type ProtocolErrorCode } from "@side-chat/chat-protocol";
import { optionalField } from "@side-chat/shared";
import { Effect, Ref } from "effect";
import {
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
} from "#errors";
import type { AssistantTurnFailureStatus } from "#ports";
import { STREAM_CHAT_FAILURES, mapPortFailure, mapSyncFailure } from "../errors/effect-failures.js";
import {
  protocolTerminalErrorCode,
  validateProtocolAccumulator,
  type ProtocolEventAccumulator,
} from "./protocol-event-accumulator.js";
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
  accumulator: Ref.Ref<ProtocolEventAccumulator>,
): Effect.Effect<void, PartnerAiCoreError> =>
  Effect.gen(function* () {
    // Validate the accumulated stream facts before writing durable outcome
    // state. A malformed runtime sequence must not be recorded as success.
    const state = yield* Ref.get(accumulator);
    yield* validateTerminalOrFailTurn(ports, turn, state);

    // Terminal code is the durable split between completed and failed turns.
    const terminalCode = protocolTerminalErrorCode(state);
    if (turn.assistantTurn.status === "running") {
      if (terminalCode) {
        yield* failAssistantTurnFromTerminal(ports, turn, terminalCode);
      } else {
        yield* completeAssistantTurnFromAccumulator(ports, input, turn, state);
      }
    }

    // Observability closes the lifecycle after persistence so diagnostics match
    // the durable turn state.
    yield* recordStreamObservationEffect(ports.observability, {
      correlation: turn.correlation,
      lifecycleState: terminalCode ? "failed" : "completed",
      assistantTurnId: turn.assistantTurnId,
      providerId: turn.policyDecision.providerId,
      modelId: turn.policyDecision.modelId,
      ...optionalField("errorCode", terminalCode),
      startedAt: turn.startedAt,
      now: ports.clock.now(),
      attributes: { eventCount: state.eventCount },
    });
  });

const validateTerminalOrFailTurn = (
  ports: StreamChatPorts,
  turn: PreparedStreamChatTurn,
  accumulator: ProtocolEventAccumulator,
): Effect.Effect<void, PartnerAiCoreError> =>
  mapSyncFailure(
    () => validateProtocolAccumulator(accumulator),
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

const completeAssistantTurnFromAccumulator = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  accumulator: ProtocolEventAccumulator,
): Effect.Effect<void, PartnerAiCoreError> => {
  const completed = accumulator.completedEvent;
  if (!completed) {
    return Effect.fail(
      new PartnerAiCoreError(
        PARTNER_AI_CORE_ERROR_CODES.INVALID_RUNTIME_SEQUENCE,
        "Stream completed without a terminal completion event.",
        PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.MALFORMED_STREAM,
      ),
    );
  }

  return Effect.gen(function* () {
    // Persist assistant content from the accumulator rather than replaying the
    // protocol event stream; long streams should not be retained only for this.
    yield* mapPortFailure(
      ports.assistantTurns.completeAssistantTurn({
        authContext: turn.authContext,
        conversation: turn.conversation,
        request: input.request,
        assistantTurnId: turn.assistantTurnId,
        assistantContent: accumulator.assistantContent,
        finishReason: completed.finishReason,
        ...optionalField("usage", completed.usage),
        providerId: turn.policyDecision.providerId,
        modelId: turn.policyDecision.modelId,
        now: completed.createdAt,
      }),
      STREAM_CHAT_FAILURES.PERSISTENCE,
    );

    // Memory writes are post-success candidates. Their failures are observed
    // but must not create a second terminal stream outcome.
    yield* recordMemoryWriteCandidatesAfterCompletion(
      ports,
      input,
      turn,
      accumulator.assistantContent,
    );
  });
};

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

const failureStatusForProtocolCode = (code: ProtocolErrorCode): AssistantTurnFailureStatus => {
  if (code === PROTOCOL_ERROR_CODES.ABORTED) return "user_aborted";
  if (code === PROTOCOL_ERROR_CODES.TIMEOUT) return "timed_out";
  if (code === PROTOCOL_ERROR_CODES.TOOL_FAILED) return "tool_failed";
  return "provider_failed";
};
