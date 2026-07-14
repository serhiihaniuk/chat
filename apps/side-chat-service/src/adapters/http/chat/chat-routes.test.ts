import type { UIMessage, UIMessageChunk } from "ai";
import { describe, expect, it, vi } from "vitest";

import { HTTP_ERROR } from "#adapters/http/error-response";
import { CHAT_HTTP_ROUTES, HTTP_HEADERS } from "#adapters/http/http-contract";
import { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import type {
  StartedTurnExecution,
  TurnExecution,
  TurnExecutionInput,
  TurnExecutionTerminal,
} from "#application/ports/turn/turn-execution";
import { TURN_MESSAGE_ROLES, TURN_TERMINAL_STATUSES, type TurnMessage } from "#domain/turn/turn";
import { createServiceTestHarness } from "#composition/route/testing-harness/service-test-harness";
import { SCRIPTED_PROVIDER } from "#config/providers/scripted-provider-config";
import { DeterministicTurnAdmission } from "#testing/turn/deterministic-turn-admission";

const TEST_CONVERSATION = {
  conversationId: "conversation-1",
  workspaceId: "local-workspace",
  subjectId: "local-workspace:subject",
} as const;

const SUCCESS_HTTP_STATUS = 200;
const TEST_RUN_ID = "run-1";
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
    });
    try {
      const response = await harness.request(
        CHAT_HTTP_ROUTES.START,
        chatRequest({ reasoningEffort: "low" }),
      );
      expect(response.status).toBe(SUCCESS_HTTP_STATUS);
      await response.text();
      expect(execution.started[0]?.reasoningEffort).toBe("low");
    } finally {
      await harness.close();
    }
  });

  it("rejects an invalid reasoning effort before execution", async () => {
    const execution = new ControlledTurnExecution(chunks(), neverTerminal());
    const harness = await createServiceTestHarness({
      turnExecution: execution,
    });
    try {
      const response = await harness.request(
        CHAT_HTTP_ROUTES.START,
        chatRequest({ reasoningEffort: "turbo" }),
      );
      expect(response.status).toBe(HTTP_ERROR.BAD_REQUEST.STATUS);
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

class ControlledTurnExecution implements TurnExecution {
  readonly started: TurnExecutionInput[] = [];
  readonly cancelled: string[] = [];

  constructor(
    private readonly stream: ReadableStream<UIMessageChunk>,
    private readonly terminal: Promise<TurnExecutionTerminal>,
  ) {}

  async start(input: TurnExecutionInput): Promise<StartedTurnExecution> {
    this.started.push(input);
    return { runId: TEST_RUN_ID, stream: this.stream, terminal: this.terminal };
  }

  async cancel(runId: string): Promise<void> {
    this.cancelled.push(runId);
  }
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

function chunks(...parts: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
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

function deferred<T>() {
  return Promise.withResolvers<T>();
}

function neverTerminal(): Promise<TurnExecutionTerminal> {
  return new Promise(() => undefined);
}
