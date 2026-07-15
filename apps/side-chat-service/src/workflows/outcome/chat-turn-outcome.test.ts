import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  TURN_EXECUTION_ERROR_CODES,
  TURN_TERMINAL_STATUSES,
  ZERO_TURN_USAGE,
} from "#domain/turn/turn";

import {
  ABORT_ERROR_NAME,
  CHAT_TURN_ERROR_CODES,
  CHAT_TURN_OUTCOMES,
  chatTurnFinalization,
  chatTurnUsage,
  classifyChatTurnOutcome,
  failedChatTurnOutcome,
  isChatTurnAbortError,
  shouldDeferChatTurnStreamFailure,
  withVisibleAssistantMessage,
  type ChatTurnTerminalOutcome,
} from "./chat-turn-outcome.js";

const ASSISTANT_MESSAGE: UIMessage = {
  id: "turn-1-assistant",
  role: "assistant",
  parts: [{ type: "text", text: "Hi there" }],
  metadata: { provider: "private" },
};

function completedOutcome(finishReason: string): ChatTurnTerminalOutcome {
  return {
    status: CHAT_TURN_OUTCOMES.COMPLETED,
    assistantMessage: ASSISTANT_MESSAGE,
    finishReason,
    activityDurationMs: 1501,
    usage: {
      inputTokens: 3,
      outputTokens: 5,
      totalTokens: 8,
      reasoningTokens: 1,
      cachedInputTokens: 2,
    },
  };
}

const CANCELLED_OUTCOME: ChatTurnTerminalOutcome = {
  status: CHAT_TURN_OUTCOMES.CANCELLED,
  reason: "user_requested_cancellation",
};

const TIMEOUT_OUTCOME: ChatTurnTerminalOutcome = {
  status: CHAT_TURN_OUTCOMES.FAILED,
  code: CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT,
};

const MODEL_FAILURE_OUTCOME: ChatTurnTerminalOutcome = {
  status: CHAT_TURN_OUTCOMES.FAILED,
  code: CHAT_TURN_ERROR_CODES.MODEL_STREAM_FAILED,
};

const PARTIAL_ASSISTANT_MESSAGE: UIMessage = {
  id: "turn-1-assistant",
  role: "assistant",
  parts: [
    { type: "reasoning", text: "Started thinking" },
    { type: "text", text: "Partial answer" },
  ],
};

describe("classifyChatTurnOutcome", () => {
  it("keeps the assistant message on an ordinary completion", () => {
    expect(classifyChatTurnOutcome(completedOutcome("stop"))).toEqual({
      status: TURN_TERMINAL_STATUSES.COMPLETED,
      finishReason: "stop",
      activityDurationMs: 1501,
      assistantMessage: {
        id: "turn-1-assistant",
        role: "assistant",
        parts: [{ type: "text", text: "Hi there" }],
        metadata: {
          usage: {
            inputTokens: 3,
            outputTokens: 5,
            totalTokens: 8,
            reasoningTokens: 1,
            cachedInputTokens: 2,
          },
          activityDurationMs: 1501,
          terminal: { status: "completed", finishReason: "stop" },
        },
      },
    });
  });

  it("blocks a content-filtered completion and drops its assistant message", () => {
    expect(classifyChatTurnOutcome(completedOutcome("content-filter"))).toEqual({
      status: TURN_TERMINAL_STATUSES.BLOCKED,
      finishReason: "content-filter",
      activityDurationMs: 1501,
    });
  });

  it("carries no message on a cancelled turn", () => {
    expect(classifyChatTurnOutcome(CANCELLED_OUTCOME)).toEqual({
      status: TURN_TERMINAL_STATUSES.CANCELLED,
    });
  });

  it("maps a provider timeout to a failed terminal with the safe code", () => {
    expect(classifyChatTurnOutcome(TIMEOUT_OUTCOME)).toEqual({
      status: TURN_TERMINAL_STATUSES.FAILED,
      safeErrorCode: TURN_EXECUTION_ERROR_CODES.PROVIDER_TIMEOUT,
    });
  });

  it("maps a model stream failure to a failed terminal with the safe code", () => {
    expect(classifyChatTurnOutcome(MODEL_FAILURE_OUTCOME)).toEqual({
      status: TURN_TERMINAL_STATUSES.FAILED,
      safeErrorCode: TURN_EXECUTION_ERROR_CODES.MODEL_STREAM_FAILED,
    });
  });

  it("keeps an interrupted assistant message with only public terminal metadata", () => {
    const partial = withVisibleAssistantMessage(TIMEOUT_OUTCOME, PARTIAL_ASSISTANT_MESSAGE);

    expect(classifyChatTurnOutcome(partial)).toEqual({
      status: TURN_TERMINAL_STATUSES.FAILED,
      safeErrorCode: TURN_EXECUTION_ERROR_CODES.PROVIDER_TIMEOUT,
      assistantMessage: {
        ...PARTIAL_ASSISTANT_MESSAGE,
        metadata: {
          usage: ZERO_TURN_USAGE,
          terminal: { status: "failed", errorCode: "timeout" },
        },
      },
    });
  });
});

describe("chatTurnUsage", () => {
  it("folds a completed outcome's aggregate usage", () => {
    expect(chatTurnUsage(completedOutcome("stop"))).toEqual({
      inputTokens: 3,
      outputTokens: 5,
      totalTokens: 8,
      reasoningTokens: 1,
      cachedInputTokens: 2,
    });
  });

  it("records zero usage for a cancelled or failed outcome", () => {
    expect(chatTurnUsage(CANCELLED_OUTCOME)).toEqual(ZERO_TURN_USAGE);
    expect(chatTurnUsage(TIMEOUT_OUTCOME)).toEqual(ZERO_TURN_USAGE);
  });
});

describe("chatTurnFinalization", () => {
  it("persists the streamed visible projection so reasoning survives completion", () => {
    const finalization = chatTurnFinalization(
      withVisibleAssistantMessage(completedOutcome("stop"), PARTIAL_ASSISTANT_MESSAGE),
    );

    expect(finalization.assistantMessage?.parts).toEqual(PARTIAL_ASSISTANT_MESSAGE.parts);
  });

  it("persists a completed terminal with its assistant message and usage", () => {
    expect(chatTurnFinalization(completedOutcome("stop"))).toEqual({
      terminal: {
        status: TURN_TERMINAL_STATUSES.COMPLETED,
        finishReason: "stop",
        usage: {
          inputTokens: 3,
          outputTokens: 5,
          totalTokens: 8,
          reasoningTokens: 1,
          cachedInputTokens: 2,
        },
      },
      assistantMessage: {
        id: "turn-1-assistant",
        role: "assistant",
        parts: [{ type: "text", text: "Hi there" }],
        metadata: {
          usage: {
            inputTokens: 3,
            outputTokens: 5,
            totalTokens: 8,
            reasoningTokens: 1,
            cachedInputTokens: 2,
          },
          activityDurationMs: 1501,
          terminal: { status: "completed", finishReason: "stop" },
        },
      },
    });
  });

  it("persists a blocked terminal without an assistant message", () => {
    const finalization = chatTurnFinalization(completedOutcome("content-filter"));
    expect(finalization.assistantMessage).toBeUndefined();
    expect(finalization.terminal.status).toBe(TURN_TERMINAL_STATUSES.BLOCKED);
    expect(finalization.terminal.finishReason).toBe("content-filter");
  });

  it("persists a cancelled terminal without an assistant message", () => {
    const finalization = chatTurnFinalization(CANCELLED_OUTCOME);
    expect(finalization.assistantMessage).toBeUndefined();
    expect(finalization.terminal).toEqual({
      status: TURN_TERMINAL_STATUSES.CANCELLED,
      usage: ZERO_TURN_USAGE,
    });
  });

  it("persists a provider-timeout failure with the safe code and no message", () => {
    const finalization = chatTurnFinalization(TIMEOUT_OUTCOME);
    expect(finalization.assistantMessage).toBeUndefined();
    expect(finalization.terminal).toEqual({
      status: TURN_TERMINAL_STATUSES.FAILED,
      safeErrorCode: TURN_EXECUTION_ERROR_CODES.PROVIDER_TIMEOUT,
      usage: ZERO_TURN_USAGE,
    });
  });

  it("persists already-streamed partial output on a provider timeout", () => {
    const finalization = chatTurnFinalization(
      withVisibleAssistantMessage(TIMEOUT_OUTCOME, PARTIAL_ASSISTANT_MESSAGE),
    );

    expect(finalization.assistantMessage).toEqual({
      ...PARTIAL_ASSISTANT_MESSAGE,
      metadata: {
        usage: ZERO_TURN_USAGE,
        terminal: { status: "failed", errorCode: "timeout" },
      },
    });
    expect(finalization.terminal.safeErrorCode).toBe(TURN_EXECUTION_ERROR_CODES.PROVIDER_TIMEOUT);
  });
});

describe("failedChatTurnOutcome", () => {
  it("classifies a non-abort stream rejection as a safe model failure", () => {
    expect(failedChatTurnOutcome()).toEqual({
      status: CHAT_TURN_OUTCOMES.FAILED,
      code: CHAT_TURN_ERROR_CODES.MODEL_STREAM_FAILED,
    });
  });
});

describe("isChatTurnAbortError", () => {
  it("recognizes a durable abort rejection by name", () => {
    expect(isChatTurnAbortError(new DOMException("stop", ABORT_ERROR_NAME))).toBe(true);
    const named = new Error("stop");
    named.name = ABORT_ERROR_NAME;
    expect(isChatTurnAbortError(named)).toBe(true);
  });

  it("rejects an ordinary provider error", () => {
    expect(isChatTurnAbortError(new Error("Scripted provider failure"))).toBe(false);
    expect(isChatTurnAbortError("aborted")).toBe(false);
  });
});

describe("shouldDeferChatTurnStreamFailure", () => {
  it("lets the controller-owned timeout win even when Workflow wraps the abort", () => {
    const wrappedAbort = new Error("Provider activity aborted");
    wrappedAbort.name = "FatalError";

    expect(shouldDeferChatTurnStreamFailure(wrappedAbort, true)).toBe(true);
  });

  it("does not treat a provider-authored abort name as controller-owned", () => {
    expect(
      shouldDeferChatTurnStreamFailure(
        new DOMException("Provider stopped", ABORT_ERROR_NAME),
        false,
      ),
    ).toBe(false);
  });
});
