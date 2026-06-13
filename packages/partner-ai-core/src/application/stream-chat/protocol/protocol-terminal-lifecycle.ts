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

  return mapPortFailure(
    ports.assistantTurns.completeAssistantTurn({
      authContext: turn.authContext,
      conversation: turn.conversation,
      request: input.request,
      assistantTurnId: turn.assistantTurnId,
      assistantContent: events
        .filter(isDeltaEvent)
        .map((event) => event.content)
        .join(""),
      finishReason: completed.finishReason,
      ...(completed.usage ? { usage: completed.usage } : {}),
      providerId: turn.policyDecision.providerId,
      modelId: turn.policyDecision.modelId,
      now: completed.createdAt,
    }),
    STREAM_CHAT_FAILURES.PERSISTENCE,
  );
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
