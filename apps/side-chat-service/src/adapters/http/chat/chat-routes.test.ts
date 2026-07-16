import type { UIMessage, UIMessageChunk } from "ai";
import { describe, expect, it, vi } from "vitest";

import { HTTP_ERROR } from "#adapters/http/error-response";
import { CHAT_HTTP_ROUTES, HTTP_HEADERS } from "#adapters/http/http-contract";
import { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import type { TurnAdmission } from "#application/ports/turn/turn-admission";
import type { TurnExecutionTerminal } from "#application/ports/turn/turn-execution";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import { TURN_MESSAGE_ROLES, TURN_TERMINAL_STATUSES, type TurnMessage } from "#domain/turn/turn";
import { createServiceTestHarness } from "#composition/route/testing-harness/service-test-harness";
import { SCRIPTED_PROVIDER } from "#config/providers/scripted-provider-config";
import { OPENAI_PROVIDER } from "#config/providers/openai-provider-config";
import { DeterministicTurnAdmission } from "#testing/turn/deterministic-turn-admission";
import {
  chunks,
  ControlledTurnExecution,
  deferred,
  neverTerminal,
  TEST_RUN_ID,
} from "#testing/http/chat/chat-routes.test-support";

const TEST_CONVERSATION = {
  conversationId: "conversation-1",
  workspaceId: "local-workspace",
  subjectId: "local-workspace:subject",
} as const;

const SUCCESS_HTTP_STATUS = 200;
const UNKNOWN_RUN_ID = "run-secret";
const RAW_PROVIDER_SENTINEL = "RAW provider secret sk-live-should-never-ship";

const acceptedUserMessage: TurnMessage = {
  id: "user-1",
  role: TURN_MESSAGE_ROLES.USER,
  text: "Hello",
};

const requestUserMessage: UIMessage = {
  id: acceptedUserMessage.id,
  role: acceptedUserMessage.role,
  parts: [{ type: "text", text: acceptedUserMessage.text }],
};

describe("chat routes", () => {
  it("streams one ordered finish and finalizes the happy path once", async () => {
    const execution = new ControlledTurnExecution(
      chunks(
        { type: "start", messageId: "assistant-1" },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: "Hello back" },
        { type: "text-end", id: "text-1" },
        { type: "finish" },
      ),
      Promise.resolve({
        status: TURN_TERMINAL_STATUSES.COMPLETED,
        stepUsage: [usage(2, 3), usage(5, 7)],
        assistantMessage: {
          id: "assistant-1",
          role: TURN_MESSAGE_ROLES.ASSISTANT,
          parts: [{ type: "text", text: "Hello back" }],
        },
      }),
    );
    const harness = await createServiceTestHarness({
      turnExecution: execution,
    });
    try {
      const response = await harness.request(CHAT_HTTP_ROUTES.START, chatRequest());
      expect(response.status).toBe(SUCCESS_HTTP_STATUS);
      expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
      expect(response.headers.get(HTTP_HEADERS.WORKFLOW_RUN_ID)).toBe(TEST_RUN_ID);
      const parts = await responseChunks(response);
      expect(parts.map((part) => part["type"])).toEqual([
        "start",
        "text-start",
        "text-delta",
        "text-end",
        "finish",
      ]);
      expect(parts.filter((part) => part["type"] === "finish")).toHaveLength(1);
      await vi.waitFor(() => expect(harness.turnState.terminals.size).toBe(1));
      expect([...harness.turnState.terminals.values()][0]?.usage).toEqual(usage(7, 10));
      expect(harness.turnState.assistantMessages).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it("threads a valid per-turn reasoning effort into execution", async () => {
    const execution = new ControlledTurnExecution(
      chunks({ type: "start", messageId: "assistant-1" }, { type: "finish" }),
      Promise.resolve({
        status: TURN_TERMINAL_STATUSES.COMPLETED,
        stepUsage: [],
        assistantMessage: {
          id: "assistant-1",
          role: TURN_MESSAGE_ROLES.ASSISTANT,
          parts: [],
        },
      }),
    );
    const harness = await createServiceTestHarness({
      turnExecution: execution,
      models: openAiReasoningModels(),
    });
    try {
      const response = await harness.request(
        CHAT_HTTP_ROUTES.START,
        chatRequest({
          modelPreference: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.MODEL_ID,
          reasoningEffort: "low",
        }),
      );
      expect(response.status).toBe(SUCCESS_HTTP_STATUS);
      await response.text();
      expect(execution.started[0]?.reasoningEffort).toBe("low");
    } finally {
      await harness.close();
    }
  });

  it("rejects unavailable model policy before admission, writes, or execution", async () => {
    const execution = new ControlledTurnExecution(chunks(), neverTerminal());
    const admission = new DeterministicTurnAdmission();
    const harness = await createServiceTestHarness({
      turnExecution: execution,
      turnAdmission: admission,
    });
    try {
      const unavailableReasoning = await harness.request(
        CHAT_HTTP_ROUTES.START,
        chatRequest({ reasoningEffort: "xhigh" }),
      );
      const unavailableModel = await harness.request(
        CHAT_HTTP_ROUTES.START,
        chatRequest({ modelPreference: "unknown-model" }),
      );
      expect(unavailableReasoning.status).toBe(HTTP_ERROR.BAD_REQUEST.STATUS);
      expect(unavailableModel.status).toBe(HTTP_ERROR.BAD_REQUEST.STATUS);
      expect(admission.admitted).toBe(0);
      expect(harness.turnState.userMessages).toEqual([]);
      expect(execution.started).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it("forwards a content-filter finish reason and records it as the blocked terminal", async () => {
    const execution = new ControlledTurnExecution(
      chunks(
        { type: "start", messageId: "assistant-1" },
        { type: "finish", finishReason: "content-filter" },
      ),
      Promise.resolve({
        status: TURN_TERMINAL_STATUSES.BLOCKED,
        stepUsage: [usage(2, 0)],
        finishReason: "content-filter",
      }),
    );
    const harness = await createServiceTestHarness({
      turnExecution: execution,
    });
    try {
      const response = await harness.request(CHAT_HTTP_ROUTES.START, chatRequest());
      const parts = await responseChunks(response);
      const finish = parts.find((part) => part["type"] === "finish");
      expect(finish?.["finishReason"]).toBe("content-filter");
      await vi.waitFor(() => expect(harness.turnState.terminals.size).toBe(1));
      expect([...harness.turnState.terminals.values()][0]).toMatchObject({
        status: TURN_TERMINAL_STATUSES.BLOCKED,
        finishReason: "content-filter",
      });
      expect(harness.turnState.assistantMessages).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  it("cancels before the first chunk while retaining only the accepted user message", async () => {
    const terminal = deferred<TurnExecutionTerminal>();
    const execution = new ControlledTurnExecution(chunks(), terminal.promise);
    const admission = new DeterministicTurnAdmission();
    const harness = await createServiceTestHarness({
      turnExecution: execution,
      turnAdmission: admission,
    });
    let response: Response | undefined;
    try {
      response = await harness.request(CHAT_HTTP_ROUTES.START, chatRequest());
      expect(response.status).toBe(SUCCESS_HTTP_STATUS);
      const cancel = await harness.request(cancelRoute(TEST_RUN_ID), {
        method: "POST",
        body: JSON.stringify({
          conversationId: TEST_CONVERSATION.conversationId,
        }),
      });
      expect(cancel.status).toBe(SUCCESS_HTTP_STATUS);
      expect(execution.cancelled).toEqual([TEST_RUN_ID]);
      terminal.resolve({
        status: TURN_TERMINAL_STATUSES.CANCELLED,
        stepUsage: [],
      });
      await vi.waitFor(() => expect(admission.released).toBe(1));
      expect(harness.turnState.userMessages).toEqual([acceptedUserMessage]);
      expect(harness.turnState.assistantMessages).toEqual([]);
    } finally {
      await response?.body?.cancel();
      await harness.close();
    }
  });

  it("preserves partial stream content and one cancelled terminal on mid-stream cancel", async () => {
    const execution = new ControlledTurnExecution(
      chunks(
        { type: "start", messageId: "assistant-1" },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: "partial" },
        { type: "abort" },
      ),
      Promise.resolve({
        status: TURN_TERMINAL_STATUSES.CANCELLED,
        stepUsage: [],
      }),
    );
    const harness = await createServiceTestHarness({
      turnExecution: execution,
    });
    try {
      const response = await harness.request(CHAT_HTTP_ROUTES.START, chatRequest());
      const parts = await responseChunks(response);
      expect(parts.map((part) => part["type"])).toEqual([
        "start",
        "text-start",
        "text-delta",
        "abort",
      ]);
      expect(parts.at(-1)?.["type"]).toBe("abort");
      await vi.waitFor(() => expect(harness.turnState.terminals.size).toBe(1));
      expect(harness.turnState.assistantMessages).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  const errorCases: ReadonlyArray<readonly [string, readonly UIMessageChunk[]]> = [
    ["before output", [{ type: "error", errorText: RAW_PROVIDER_SENTINEL }]],
    [
      "after partial output",
      [
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: "partial" },
        { type: "error", errorText: RAW_PROVIDER_SENTINEL },
      ],
    ],
  ];
  it.each(errorCases)("scrubs provider errors to a safe code %s", async (_label, streamParts) => {
    const execution = new ControlledTurnExecution(
      chunks(...streamParts),
      Promise.resolve({
        status: TURN_TERMINAL_STATUSES.FAILED,
        stepUsage: [],
      }),
    );
    const harness = await createServiceTestHarness({
      turnExecution: execution,
    });
    try {
      const response = await harness.request(CHAT_HTTP_ROUTES.START, chatRequest());
      expect(response.status).toBe(SUCCESS_HTTP_STATUS);
      const body = await responseText(response);
      expect(body).not.toContain(RAW_PROVIDER_SENTINEL);
      const parts = decodeChunks(body);
      const errors = parts.filter((part) => part["type"] === "error");
      expect(errors).toHaveLength(1);
      expect(errors[0]?.["errorText"]).toBe("provider_failed");
      expect(parts.at(-1)?.["type"]).toBe("error");
      await vi.waitFor(() => expect(harness.turnState.terminals.size).toBe(1));
      expect(harness.turnState.assistantMessages).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it("rejects a busy conversation before admission, writes, or execution", async () => {
    const state = ownedState();
    state.runningTurns.add(TEST_CONVERSATION.conversationId);
    const admission = new DeterministicTurnAdmission();
    const execution = new ControlledTurnExecution(chunks(), neverTerminal());
    const harness = await createServiceTestHarness({
      turnState: state,
      turnAdmission: admission,
      turnExecution: execution,
    });
    try {
      const response = await harness.request(CHAT_HTTP_ROUTES.START, chatRequest());
      expect(response.status).toBe(HTTP_ERROR.CONFLICT.STATUS);
      expect(admission.admitted).toBe(0);
      expect(state.userMessages).toEqual([]);
      expect(execution.started).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it("maps capacity rejection before writes to 503 with Retry-After", async () => {
    const state = ownedState();
    const execution = new ControlledTurnExecution(chunks(), neverTerminal());
    const admission: TurnAdmission = {
      admitTurn: () =>
        Promise.reject(
          new TurnRejectedError(
            TURN_REJECTION_CODES.CAPACITY,
            "Turn capacity is temporarily exhausted",
            5,
          ),
        ),
    };
    const harness = await createServiceTestHarness({
      turnState: state,
      turnAdmission: admission,
      turnExecution: execution,
    });
    try {
      const response = await harness.request(CHAT_HTTP_ROUTES.START, chatRequest());
      expect(response.status).toBe(HTTP_ERROR.SERVICE_UNAVAILABLE.STATUS);
      expect(response.headers.get(HTTP_HEADERS.RETRY_AFTER)).toBe("5");
      await expect(response.json()).resolves.toMatchObject({ code: "rate_limited" });
      expect(state.userMessages).toEqual([]);
      expect(state.runningTurns.size).toBe(0);
      expect(execution.started).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it("rejects POST and cancel ownership violations before execution", async () => {
    const state = new InMemoryTurnState([
      {
        conversationId: TEST_CONVERSATION.conversationId,
        workspaceId: "another-workspace",
        subjectId: "another-subject",
      },
    ]);
    const execution = new ControlledTurnExecution(chunks(), neverTerminal());
    const harness = await createServiceTestHarness({
      turnState: state,
      turnExecution: execution,
    });
    try {
      expect((await harness.request(CHAT_HTTP_ROUTES.START, chatRequest())).status).toBe(
        HTTP_ERROR.FORBIDDEN.STATUS,
      );
      expect(
        (
          await harness.request(cancelRoute(UNKNOWN_RUN_ID), {
            method: "POST",
            body: JSON.stringify({
              conversationId: TEST_CONVERSATION.conversationId,
            }),
          })
        ).status,
      ).toBe(HTTP_ERROR.FORBIDDEN.STATUS);
      expect(execution.started).toEqual([]);
      expect(execution.cancelled).toEqual([]);
    } finally {
      await harness.close();
    }
  });
});

function openAiReasoningModels() {
  return {
    provider: OPENAI_PROVIDER.KIND,
    connection: { apiKey: "test-key" },
    defaultModelId: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.MODEL_ID,
    availableModels: [
      {
        id: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.MODEL_ID,
        contextWindowTokens: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.CONTEXT_WINDOW_TOKENS,
        reasoning: {
          defaultEffort: OPENAI_PROVIDER.REASONING_EFFORTS.MEDIUM,
          efforts: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.SUPPORTED_REASONING_EFFORTS,
        },
      },
    ],
  } as const;
}

function chatRequest(extra: Record<string, unknown> = {}): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify({
      requestId: "request-1",
      conversationId: TEST_CONVERSATION.conversationId,
      messages: [requestUserMessage],
      modelPreference: SCRIPTED_PROVIDER.MODELS.COMPLETE.MODEL_ID,
      ...extra,
    }),
  };
}

async function responseText(response: Response): Promise<string> {
  return response.text();
}

async function responseChunks(response: Response): Promise<Array<Record<string, unknown>>> {
  return decodeChunks(await response.text());
}

function decodeChunks(text: string): Array<Record<string, unknown>> {
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .filter((line) => line !== "data: [DONE]")
    .map((line) => parseStreamPart(line.slice(6)));
}

function parseStreamPart(source: string): Record<string, unknown> {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value) || typeof value["type"] !== "string") {
    throw new Error(`Expected a UI message stream part: ${source}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function usage(inputTokens: number, outputTokens: number) {
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    reasoningTokens: 0,
    cachedInputTokens: 0,
  };
}

function ownedState(): InMemoryTurnState {
  return new InMemoryTurnState([TEST_CONVERSATION]);
}

function cancelRoute(runId: string): string {
  return CHAT_HTTP_ROUTES.CANCEL.replace(":runId", runId);
}
