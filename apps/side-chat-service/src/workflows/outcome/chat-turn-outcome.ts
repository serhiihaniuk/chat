import type { UIMessage } from "ai";
import {
  isSideChatFinishReason,
  SIDE_CHAT_ERROR_CODES as PUBLIC_ERROR_CODES,
  SIDE_CHAT_MESSAGE_TERMINAL_STATUSES,
  type SideChatErrorCode,
  type SideChatMessageTerminal,
} from "@side-chat/stream-profile";

import {
  TURN_EXECUTION_ERROR_CODES,
  TURN_TERMINAL_STATUSES,
  ZERO_TURN_USAGE,
  type TurnExecutionErrorCode,
  type TurnTerminal,
  type TurnTerminalStatus,
  type TurnUsage,
} from "#domain/turn/turn";

export const CHAT_TURN_OUTCOMES = {
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  FAILED: "failed",
} as const;

export const CHAT_TURN_ERROR_CODES = {
  MODEL_STREAM_FAILED: "model_stream_failed",
  PROVIDER_TIMEOUT: "provider_timeout",
} as const;

/** Native provider finish reason that marks content-filtered ("blocked") output. */
const CONTENT_FILTER_FINISH_REASON = "content-filter";

/** Abort rejections must carry this `Error.name` or the engine retries the step. */
export const ABORT_ERROR_NAME = "AbortError";

interface SerializableUsage {
  readonly inputTokens: number | undefined;
  readonly outputTokens: number | undefined;
  readonly totalTokens: number | undefined;
  readonly reasoningTokens: number | undefined;
  readonly cachedInputTokens: number | undefined;
}

export type ChatTurnTerminalOutcome =
  | {
      readonly status: typeof CHAT_TURN_OUTCOMES.COMPLETED;
      readonly assistantMessage: UIMessage;
      readonly finishReason: string;
      readonly activityDurationMs: number;
      readonly usage: SerializableUsage;
    }
  | {
      readonly status: typeof CHAT_TURN_OUTCOMES.CANCELLED;
      readonly reason: string;
      readonly assistantMessage?: UIMessage | undefined;
    }
  | {
      readonly status: typeof CHAT_TURN_OUTCOMES.FAILED;
      readonly code:
        | typeof CHAT_TURN_ERROR_CODES.MODEL_STREAM_FAILED
        | typeof CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT;
      readonly assistantMessage?: UIMessage | undefined;
    };

/**
 * The single decision that keeps the route terminal and the durable claim in
 * agreement: which durable status a workflow outcome maps to, and whether it
 * carries an assistant message. A `content-filter` completion is `blocked` with no
 * message; a cancel or failure may carry only text/reasoning already exposed on
 * the public stream.
 */
export type ChatTurnClassification = Readonly<{
  status: TurnTerminalStatus;
  finishReason?: string;
  activityDurationMs?: number;
  safeErrorCode?: TurnExecutionErrorCode;
  assistantMessage?: UIMessage;
}>;

/** The durable-write payload derived from a classification and folded usage. */
export type ChatTurnFinalization = Readonly<{
  terminal: TurnTerminal;
  assistantMessage?: UIMessage;
}>;

/**
 * A non-abort stream rejection is always a safe, opaque model failure. Cancel and
 * timeout are never classified here: they are decided by construction in the
 * explicit race arms, so an aborted stream defers rather than reaching this path.
 */
export function failedChatTurnOutcome(): ChatTurnTerminalOutcome {
  return {
    status: CHAT_TURN_OUTCOMES.FAILED,
    code: CHAT_TURN_ERROR_CODES.MODEL_STREAM_FAILED,
  };
}

/**
 * Fold the closed journal's visible projection into the terminal outcome.
 *
 * The provider result still owns terminal status, finish reason, and usage. The
 * journal owns message parts because it is the exact text/reasoning already
 * published to the browser. Preferring it keeps live output and durable history
 * identical across completion, interruption, and refresh.
 */
export function withVisibleAssistantMessage(
  outcome: ChatTurnTerminalOutcome,
  assistantMessage: UIMessage | undefined,
): ChatTurnTerminalOutcome {
  if (assistantMessage === undefined) return outcome;
  return { ...outcome, assistantMessage };
}

/** True for the durable abort rejection our cancel/timeout paths raise. */
export function isChatTurnAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === ABORT_ERROR_NAME;
}

/**
 * Workflow can wrap a provider abort while crossing realms, so error identity
 * cannot decide which race arm owns the terminal. The controller that requested
 * cancellation or timeout is the stable authority.
 */
export function shouldDeferChatTurnStreamFailure(
  _error: unknown,
  controllerAbortRequested: boolean,
): boolean {
  return controllerAbortRequested;
}

/** The single source both the route terminal and the durable claim derive from. */
export function classifyChatTurnOutcome(outcome: ChatTurnTerminalOutcome): ChatTurnClassification {
  if (outcome.status === CHAT_TURN_OUTCOMES.COMPLETED) {
    if (outcome.finishReason === CONTENT_FILTER_FINISH_REASON) {
      return {
        status: TURN_TERMINAL_STATUSES.BLOCKED,
        finishReason: outcome.finishReason,
        activityDurationMs: outcome.activityDurationMs,
      };
    }
    return {
      status: TURN_TERMINAL_STATUSES.COMPLETED,
      finishReason: outcome.finishReason,
      activityDurationMs: outcome.activityDurationMs,
      assistantMessage: withMessageMetadata(
        outcome.assistantMessage,
        chatTurnUsage(outcome),
        {
          status: SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.COMPLETED,
          ...(isSideChatFinishReason(outcome.finishReason)
            ? { finishReason: outcome.finishReason }
            : {}),
        },
        outcome.activityDurationMs,
      ),
    };
  }
  if (outcome.status === CHAT_TURN_OUTCOMES.CANCELLED) {
    return {
      status: TURN_TERMINAL_STATUSES.CANCELLED,
      ...(outcome.assistantMessage === undefined
        ? {}
        : {
            assistantMessage: withMessageMetadata(outcome.assistantMessage, ZERO_TURN_USAGE, {
              status: SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.CANCELLED,
            }),
          }),
    };
  }
  const safeErrorCode = toTurnExecutionErrorCode(outcome.code);
  return {
    status: TURN_TERMINAL_STATUSES.FAILED,
    safeErrorCode,
    ...(outcome.assistantMessage === undefined
      ? {}
      : {
          assistantMessage: withMessageMetadata(outcome.assistantMessage, ZERO_TURN_USAGE, {
            status: SIDE_CHAT_MESSAGE_TERMINAL_STATUSES.FAILED,
            errorCode: toPublicTurnErrorCode(safeErrorCode),
          }),
        }),
  };
}

/** Fold the outcome's aggregate usage into the domain shape; zero unless completed. */
export function chatTurnUsage(outcome: ChatTurnTerminalOutcome): TurnUsage {
  if (outcome.status !== CHAT_TURN_OUTCOMES.COMPLETED) return ZERO_TURN_USAGE;
  const inputTokens = outcome.usage.inputTokens ?? 0;
  const outputTokens = outcome.usage.outputTokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: outcome.usage.totalTokens ?? inputTokens + outputTokens,
    reasoningTokens: outcome.usage.reasoningTokens ?? 0,
    cachedInputTokens: outcome.usage.cachedInputTokens ?? 0,
  };
}

/** Build the durable-write payload the workflow finalize step persists. */
export function chatTurnFinalization(outcome: ChatTurnTerminalOutcome): ChatTurnFinalization {
  const classification = classifyChatTurnOutcome(outcome);
  const terminal: TurnTerminal = {
    status: classification.status,
    usage: chatTurnUsage(outcome),
    ...(classification.safeErrorCode === undefined
      ? {}
      : { safeErrorCode: classification.safeErrorCode }),
    ...(classification.finishReason === undefined
      ? {}
      : { finishReason: classification.finishReason }),
  };
  return classification.assistantMessage === undefined
    ? { terminal }
    : { terminal, assistantMessage: classification.assistantMessage };
}

function withMessageMetadata(
  message: UIMessage,
  usage: TurnUsage,
  terminal: SideChatMessageTerminal,
  activityDurationMs?: number,
): UIMessage {
  return {
    ...message,
    metadata: {
      usage,
      terminal,
      ...(activityDurationMs === undefined ? {} : { activityDurationMs }),
    },
  };
}

export function toPublicTurnErrorCode(code: TurnExecutionErrorCode | undefined): SideChatErrorCode {
  if (code === TURN_EXECUTION_ERROR_CODES.PROVIDER_TIMEOUT) {
    return PUBLIC_ERROR_CODES.TIMEOUT;
  }
  if (code === TURN_EXECUTION_ERROR_CODES.MODEL_STREAM_FAILED) {
    return PUBLIC_ERROR_CODES.PROVIDER_FAILED;
  }
  return PUBLIC_ERROR_CODES.INTERNAL_ERROR;
}

function toTurnExecutionErrorCode(
  code: (typeof CHAT_TURN_ERROR_CODES)[keyof typeof CHAT_TURN_ERROR_CODES],
): TurnExecutionErrorCode {
  if (code === CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT) {
    return TURN_EXECUTION_ERROR_CODES.PROVIDER_TIMEOUT;
  }
  return TURN_EXECUTION_ERROR_CODES.MODEL_STREAM_FAILED;
}
