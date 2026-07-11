import type { UIMessageChunk } from "ai";

import type { TurnExecution, TurnExecutionTerminal } from "#application/ports/turn/turn-execution";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { Settings } from "#config/settings/resolve-settings";
import {
  TURN_EXECUTION_ERROR_CODES,
  TURN_MESSAGE_ROLES,
  TURN_OUTPUT_EVENT_TYPES,
  TURN_TERMINAL_STATUSES,
  type TurnMessage,
  type TurnOutputEvent,
  type TurnUsage,
} from "#domain/turn/turn";
import {
  CHAT_TURN_ERROR_CODES,
  CHAT_TURN_OUTCOMES,
  cancelChatTurn,
  startChatTurn,
  type ChatTurnTerminalOutcome,
  type ChatTurnWorkflowInput,
  type SerializableChatMessage,
  type StartedChatTurn,
} from "#workflows/production/chat-turn";

export type StartChatTurn = (input: ChatTurnWorkflowInput) => Promise<StartedChatTurn>;

const TURN_CANCELLATION = {
  USER_REASON: "user_requested_cancellation",
} as const;

/** Route-bundle adapter from application turn execution to durable Workflow calls. */
export function createWorkflowTurnExecution(
  settings: Settings,
  startTurn: StartChatTurn = startChatTurn,
): TurnExecution {
  return {
    async start(input) {
      const started = await startTurn({
        turnId: input.turnId,
        requestId: input.requestId,
        modelId: input.modelId,
        instructions: settings.agent.instructions,
        maxSteps: settings.agent.maxSteps,
        providerTimeoutMs: settings.timeouts.providerMs,
        messages: input.messages.map(toSerializableMessage),
        clientTools: input.clientTools,
      });
      return {
        runId: started.runId,
        stream: started.stream.pipeThrough(toTurnOutputEvents()),
        terminal: started.terminal.then((terminal) =>
          toApplicationTerminal(input.turnId, terminal),
        ),
      };
    },
    async cancel(runId) {
      const resumed = await cancelChatTurn(runId, TURN_CANCELLATION.USER_REASON);
      if (!resumed) {
        throw new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Turn run not found");
      }
    },
  };
}

function toSerializableMessage(message: TurnMessage): SerializableChatMessage {
  return {
    role: message.role,
    content: message.text,
  };
}

function toApplicationTerminal(
  turnId: string,
  terminal: ChatTurnTerminalOutcome,
): TurnExecutionTerminal {
  if (terminal.status === CHAT_TURN_OUTCOMES.COMPLETED) {
    const assistantMessage = toAssistantMessage(turnId, terminal.text);
    if (assistantMessage === undefined) {
      return {
        status: TURN_TERMINAL_STATUSES.COMPLETED,
        stepUsage: [toUsage(terminal.usage)],
      };
    }
    return {
      status: TURN_TERMINAL_STATUSES.COMPLETED,
      stepUsage: [toUsage(terminal.usage)],
      assistantMessage,
    };
  }
  if (terminal.status === CHAT_TURN_OUTCOMES.CANCELLED) {
    return { status: TURN_TERMINAL_STATUSES.CANCELLED, stepUsage: [] };
  }
  return {
    status: TURN_TERMINAL_STATUSES.FAILED,
    stepUsage: [],
    safeErrorCode: toApplicationErrorCode(terminal.code),
  };
}

function toApplicationErrorCode(
  code: (typeof CHAT_TURN_ERROR_CODES)[keyof typeof CHAT_TURN_ERROR_CODES],
) {
  if (code === CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT) {
    return TURN_EXECUTION_ERROR_CODES.PROVIDER_TIMEOUT;
  }
  return TURN_EXECUTION_ERROR_CODES.MODEL_STREAM_FAILED;
}

function toAssistantMessage(turnId: string, text: string): TurnMessage | undefined {
  if (text.length === 0) return undefined;
  return {
    id: `${turnId}-assistant`,
    role: TURN_MESSAGE_ROLES.ASSISTANT,
    text,
  };
}

function toTurnOutputEvents(): TransformStream<UIMessageChunk, TurnOutputEvent> {
  return new TransformStream({
    transform(chunk, controller) {
      const event = toTurnOutputEvent(chunk);
      if (event !== undefined) controller.enqueue(event);
    },
  });
}

function toTurnOutputEvent(chunk: UIMessageChunk): TurnOutputEvent | undefined {
  if (chunk.type === "start") return toStartEvent(chunk);
  if (chunk.type === "text-start") return toTextStartEvent(chunk);
  if (chunk.type === "text-delta") return toTextDeltaEvent(chunk);
  if (chunk.type === "text-end") return toTextEndEvent(chunk);
  if (chunk.type === "error") return toErrorEvent();
  if (chunk.type === "abort") return { type: TURN_OUTPUT_EVENT_TYPES.ABORT };
  if (chunk.type === "finish") return { type: TURN_OUTPUT_EVENT_TYPES.FINISH };
  return undefined;
}

function toStartEvent(chunk: Extract<UIMessageChunk, { type: "start" }>): TurnOutputEvent {
  return {
    type: TURN_OUTPUT_EVENT_TYPES.START,
    messageId: chunk.messageId ?? crypto.randomUUID(),
  };
}

function toTextStartEvent(chunk: Extract<UIMessageChunk, { type: "text-start" }>): TurnOutputEvent {
  return { type: TURN_OUTPUT_EVENT_TYPES.TEXT_START, textId: chunk.id };
}

function toTextDeltaEvent(chunk: Extract<UIMessageChunk, { type: "text-delta" }>): TurnOutputEvent {
  return {
    type: TURN_OUTPUT_EVENT_TYPES.TEXT_DELTA,
    textId: chunk.id,
    delta: chunk.delta,
  };
}

function toTextEndEvent(chunk: Extract<UIMessageChunk, { type: "text-end" }>): TurnOutputEvent {
  return { type: TURN_OUTPUT_EVENT_TYPES.TEXT_END, textId: chunk.id };
}

function toErrorEvent(): TurnOutputEvent {
  return {
    type: TURN_OUTPUT_EVENT_TYPES.ERROR,
    errorCode: TURN_EXECUTION_ERROR_CODES.MODEL_STREAM_FAILED,
  };
}

function toUsage(usage: {
  readonly inputTokens: number | undefined;
  readonly outputTokens: number | undefined;
  readonly totalTokens: number | undefined;
}): TurnUsage {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
  };
}
