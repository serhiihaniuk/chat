import type { UIMessageChunk } from "ai";

import { SIDE_CHAT_FINISH_REASONS, type SideChatFinishReason } from "@side-chat/stream-profile";

import type { TurnExecution, TurnExecutionTerminal } from "#application/ports/turn/turn-execution";
import { UI_MESSAGE_CHUNK_TYPES } from "#application/turn/stream/ui-message-chunk-types";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { Settings } from "#config/settings/resolve-settings";
import {
  TURN_EXECUTION_ERROR_CODES,
  TURN_MESSAGE_ROLES,
  TURN_TERMINAL_STATUSES,
  type TurnMessage,
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

/**
 * Adapt durable Workflow runs to the application `TurnExecution` port: launch a
 * run, re-attach the native finish reason from its terminal, and map the durable
 * outcome to the application terminal.
 *
 * @param settings - Resolved service settings; supplies the agent instructions,
 *   step cap, and provider timeout carried into each run.
 * @param startTurn - How a run is launched. Defaults to the real `startChatTurn`
 *   Workflow entry; route tests inject a fake to drive the stream and terminal directly.
 */
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
      const terminal = started.terminal.then((outcome) =>
        toApplicationTerminal(input.turnId, outcome),
      );
      return {
        runId: started.runId,
        stream: stampFinishReason(started.stream, terminal),
        terminal,
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
    const completed: TurnExecutionTerminal = {
      status: TURN_TERMINAL_STATUSES.COMPLETED,
      stepUsage: [toUsage(terminal.usage)],
      finishReason: terminal.finishReason,
    };
    if (assistantMessage === undefined) return completed;
    return { ...completed, assistantMessage };
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

/**
 * The SDK's model-call transform emits a bare `finish` chunk; the native finish
 * reason survives only in the run's terminal outcome. Re-attach it here, at the
 * one edge that holds both the stream and the terminal, so `content-filter` and
 * `length` reach the client as native finish semantics.
 */
export function stampFinishReason(
  stream: ReadableStream<UIMessageChunk>,
  terminal: Promise<Readonly<{ finishReason?: string }>>,
): ReadableStream<UIMessageChunk> {
  return stream.pipeThrough(
    new TransformStream({
      async transform(chunk, controller) {
        if (chunk.type !== UI_MESSAGE_CHUNK_TYPES.FINISH) {
          controller.enqueue(chunk);
          return;
        }
        const reason = toFinishReason((await terminal).finishReason);
        controller.enqueue(reason === undefined ? chunk : { ...chunk, finishReason: reason });
      },
    }),
  );
}

function toFinishReason(value: string | undefined): SideChatFinishReason | undefined {
  for (const reason of Object.values(SIDE_CHAT_FINISH_REASONS)) {
    if (reason === value) return reason;
  }
  return undefined;
}

function toUsage(usage: {
  readonly inputTokens: number | undefined;
  readonly outputTokens: number | undefined;
  readonly totalTokens: number | undefined;
}) {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
  };
}
