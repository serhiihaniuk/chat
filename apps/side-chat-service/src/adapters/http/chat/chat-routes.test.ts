import type { UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";

import { HTTP_STATUS } from "#adapters/http/error-response";
import { CHAT_HTTP_ROUTES, HTTP_HEADERS } from "#adapters/http/http-contract";
import { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import type {
  StartedTurnExecution,
  TurnExecution,
  TurnExecutionInput,
  TurnExecutionTerminal,
} from "#application/ports/turn/turn-execution";
import {
  TURN_EXECUTION_ERROR_CODES,
  TURN_MESSAGE_ROLES,
  TURN_OUTPUT_EVENT_TYPES,
  TURN_TERMINAL_STATUSES,
  type TurnMessage,
  type TurnOutputEvent,
} from "#domain/turn/turn";
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
        { type: TURN_OUTPUT_EVENT_TYPES.START, messageId: "assistant-1" },
        { type: TURN_OUTPUT_EVENT_TYPES.TEXT_START, textId: "text-1" },
        {
          type: TURN_OUTPUT_EVENT_TYPES.TEXT_DELTA,
          textId: "text-1",
          delta: "Hello back",
        },
        { type: TURN_OUTPUT_EVENT_TYPES.TEXT_END, textId: "text-1" },
        { type: TURN_OUTPUT_EVENT_TYPES.FINISH },
      ),
      Promise.resolve({
        status: TURN_TERMINAL_STATUSES.COMPLETED,
        stepUsage: [usage(2, 3), usage(5, 7)],
        assistantMessage: {
          id: "assistant-1",
          role: TURN_MESSAGE_ROLES.ASSISTANT,
          text: "Hello back",
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
      expect(parts.map((part) => part.type)).toEqual([
        "start",
        "text-start",
        "text-delta",
        "text-end",
        "finish",
      ]);
      expect(parts.filter((part) => part.type === "finish")).toHaveLength(1);
      await vi.waitFor(() => expect(harness.turnState.terminals.size).toBe(1));
      expect([...harness.turnState.terminals.values()][0]?.usage).toEqual(usage(7, 10));
      expect(harness.turnState.assistantMessages).toHaveLength(1);
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
        { type: TURN_OUTPUT_EVENT_TYPES.START, messageId: "assistant-1" },
        { type: TURN_OUTPUT_EVENT_TYPES.TEXT_START, textId: "text-1" },
        {
          type: TURN_OUTPUT_EVENT_TYPES.TEXT_DELTA,
          textId: "text-1",
          delta: "partial",
        },
        { type: TURN_OUTPUT_EVENT_TYPES.ABORT },
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
      expect(parts.map((part) => part.type)).toEqual([
        "start",
        "text-start",
        "text-delta",
        "abort",
      ]);
      expect(parts.at(-1)?.type).toBe("abort");
      await vi.waitFor(() => expect(harness.turnState.terminals.size).toBe(1));
      expect(harness.turnState.assistantMessages).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it.each([
    [
      "before output",
      [
        {
          type: TURN_OUTPUT_EVENT_TYPES.ERROR,
          errorCode: TURN_EXECUTION_ERROR_CODES.MODEL_STREAM_FAILED,
        },
      ] satisfies TurnOutputEvent[],
    ],
    [
      "after partial output",
      [
        { type: TURN_OUTPUT_EVENT_TYPES.TEXT_START, textId: "text-1" },
        {
          type: TURN_OUTPUT_EVENT_TYPES.TEXT_DELTA,
          textId: "text-1",
          delta: "partial",
        },
        {
          type: TURN_OUTPUT_EVENT_TYPES.ERROR,
          errorCode: TURN_EXECUTION_ERROR_CODES.MODEL_STREAM_FAILED,
        },
      ] satisfies TurnOutputEvent[],
    ],
  ])("keeps provider errors %s inside the opened stream", async (_label, streamParts) => {
    const execution = new ControlledTurnExecution(
      chunks(...streamParts),
      Promise.resolve({
        status: TURN_TERMINAL_STATUSES.FAILED,
        stepUsage: [],
        safeErrorCode: TURN_EXECUTION_ERROR_CODES.MODEL_STREAM_FAILED,
      }),
    );
    const harness = await createServiceTestHarness({
      turnExecution: execution,
    });
    try {
      const response = await harness.request(CHAT_HTTP_ROUTES.START, chatRequest());
      expect(response.status).toBe(SUCCESS_HTTP_STATUS);
      const parts = await responseChunks(response);
      expect(parts.at(-1)?.type).toBe("error");
      expect(parts.filter((part) => part.type === "error")).toHaveLength(1);
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
      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
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
        HTTP_STATUS.FORBIDDEN,
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
      ).toBe(HTTP_STATUS.FORBIDDEN);
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
    private readonly stream: ReadableStream<TurnOutputEvent>,
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

function chatRequest(): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify({
      requestId: "request-1",
      conversationId: TEST_CONVERSATION.conversationId,
      messages: [requestUserMessage],
      modelPreference: SCRIPTED_PROVIDER.MODELS.COMPLETE.MODEL_ID,
    }),
  };
}

function chunks(...parts: TurnOutputEvent[]): ReadableStream<TurnOutputEvent> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

async function responseChunks(response: Response): Promise<Array<Readonly<{ type: string }>>> {
  const body = await response.text();
  return body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .filter((line) => line !== "data: [DONE]")
    .map((line) => parseStreamPart(line.slice(6)));
}

function parseStreamPart(source: string): Readonly<{ type: string }> {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value) || typeof value["type"] !== "string") {
    throw new Error(`Expected a UI message stream part: ${source}`);
  }
  return { type: value["type"] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function usage(inputTokens: number, outputTokens: number) {
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
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
