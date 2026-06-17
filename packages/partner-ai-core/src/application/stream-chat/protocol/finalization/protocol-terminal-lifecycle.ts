import { PROTOCOL_ERROR_CODES, type ProtocolErrorCode } from "@side-chat/chat-protocol";
import { omitUndefinedProperties } from "@side-chat/shared";
import { Effect, Ref } from "effect";
import {
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
} from "#errors";
import type { AssistantTurnFailureStatus } from "#ports";
import {
  STREAM_CHAT_FAILURES,
  mapPortFailure,
  mapSyncFailure,
} from "../../errors/effect-failures.js";
import {
  protocolTerminalErrorCode,
  validateProtocolAccumulator,
  type ProtocolEventAccumulator,
} from "./protocol-event-accumulator.js";
import { recordStreamObservationEffect } from "../../observability/stream-chat-observability.js";
import { prepareConversationTitleAfterCompletion } from "../../conversation-title/prepare-conversation-title.js";
import type {
  PreparedStreamChatTurn,
  StreamChatInput,
  StreamChatPorts,
} from "../../stream-chat-types.js";

/**
 * Persist the final result after a browser stream closes.
 *
 * The accumulator is checked before writing complete/failed state so persisted
 * turn status matches the events the browser actually received.
 */
export const finalizeProtocolStream = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  accumulator: Ref.Ref<ProtocolEventAccumulator>,
): Effect.Effect<void, PartnerAiCoreError> =>
  Effect.gen(function* () {
    const state = yield* Ref.get(accumulator);
    // If stream events are malformed, write a failed turn before surfacing the
    // protocol error. Never let a malformed stream be saved as completed.
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
    yield* recordStreamObservationEffect(
      ports.observability,
      omitUndefinedProperties({
        correlation: turn.correlation,
        lifecycleState: terminalCode ? "failed" : "completed",
        assistantTurnId: turn.assistantTurnId,
        providerId: turn.policyDecision.providerId,
        modelId: turn.policyDecision.modelId,
        errorCode: terminalCode,
        startedAt: turn.startedAt,
        now: ports.clock.now(),
        attributes: { eventCount: state.eventCount },
      }),
    );
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
      ports.assistantTurns.completeAssistantTurn(
        omitUndefinedProperties({
          authContext: turn.authContext,
          conversation: turn.conversation,
          request: input.request,
          assistantTurnId: turn.assistantTurnId,
          assistantContent: accumulator.assistantContent,
          finishReason: completed.finishReason,
          usage: completed.usage,
          providerId: turn.policyDecision.providerId,
          modelId: turn.policyDecision.modelId,
          now: completed.createdAt,
        }),
      ),
      STREAM_CHAT_FAILURES.PERSISTENCE,
    );

    // Conversation titles are post-success enrichment. They are allowed to
    // fail independently because the browser-visible answer already completed.
    yield* prepareConversationTitleAfterCompletion(
      ports,
      input,
      turn,
      accumulator.assistantContent,
    );
  });
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
