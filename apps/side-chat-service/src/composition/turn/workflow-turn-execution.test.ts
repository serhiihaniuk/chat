import type { UIMessage, UIMessageChunk } from "ai";
import { describe, expect, it, vi } from "vitest";

import { validateSettings } from "#config/settings/resolve-settings";
import { createDefaultConfig } from "#config/settings/settings.test-fixture";
import { TURN_MESSAGE_ROLES, TURN_TERMINAL_STATUSES } from "#domain/turn/turn";
import { CHAT_TURN_OUTCOMES } from "#workflows/production/chat-turn";

import {
  createWorkflowTurnExecution,
  type StartChatTurn,
} from "./workflow-turn-execution.js";

function testSettings() {
  const result = validateSettings(createDefaultConfig());
  if (!result.ok) throw new Error("Test settings must be valid");
  return result.settings;
}

const TURN_INPUT = {
  auth: {
    workspaceId: "workspace-1",
    subjectId: "subject-1",
    issuedAt: "2026-01-01T00:00:00.000Z",
  },
  conversationId: "conversation-1",
  turnId: "turn-1",
  requestId: "request-1",
  modelId: "test-model",
  messages: [{ id: "user-1", role: TURN_MESSAGE_ROLES.USER, text: "Hello" }],
  clientTools: [],
} as const;

function usage(inputTokens: number, outputTokens: number) {
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    reasoningTokens: 0,
    cachedInputTokens: 0,
  };
}

describe("createWorkflowTurnExecution", () => {
  it("passes timeout and client-tool metadata into the workflow boundary", async () => {
    const settings = testSettings();
    const startTurn = vi.fn<StartChatTurn>(() =>
      Promise.resolve({
        runId: "run-1",
        stream: new ReadableStream<UIMessageChunk>(),
        terminal: Promise.resolve({
          status: CHAT_TURN_OUTCOMES.COMPLETED,
          assistantMessage: {
            id: "turn-1-assistant",
            role: "assistant",
            parts: [],
          },
          finishReason: "stop",
          usage: usage(0, 0),
        }),
      }),
    );
    const execution = createWorkflowTurnExecution(
      {
        ...settings,
        persistence: { databaseUrl: "postgres://test" },
      },
      startTurn,
    );
    const clientTools = [
      {
        name: "open_file",
        description: "Open a file in the host application.",
        inputSchema: { type: "object" },
      },
    ];

    await execution.start({ ...TURN_INPUT, clientTools });

    expect(startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: TURN_INPUT.auth.workspaceId,
        providerTimeoutMs: settings.timeouts.providerMs,
        clientToolTimeoutMs: settings.timeouts.clientToolMs,
        clientTools,
      }),
    );
  });

  it("rejects client tools before workflow start when persistence is unavailable", async () => {
    const startTurn = vi.fn<StartChatTurn>();
    const execution = createWorkflowTurnExecution(testSettings(), startTurn);

    await expect(
      execution.start({
        ...TURN_INPUT,
        clientTools: [
          {
            name: "open_file",
            description: "Open a file in the host application.",
            inputSchema: { type: "object" },
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "client_tools_require_persistence",
      message: "Client tools require durable persistence",
    });
    expect(startTurn).not.toHaveBeenCalled();
  });

  it("stamps the terminal finish reason onto the wire finish chunk", async () => {
    const startTurn = vi.fn<StartChatTurn>(() =>
      Promise.resolve({
        runId: "run-1",
        stream: chunks(
          { type: "start", messageId: "assistant-1" },
          { type: "finish" },
        ),
        terminal: Promise.resolve({
          status: CHAT_TURN_OUTCOMES.COMPLETED,
          assistantMessage: {
            id: "turn-1-assistant",
            role: "assistant",
            parts: [],
          },
          finishReason: "content-filter",
          usage: usage(1, 0),
        }),
      }),
    );
    const execution = createWorkflowTurnExecution(testSettings(), startTurn);

    const started = await execution.start(TURN_INPUT);
    const parts = await readAll(started.stream);

    expect(parts.find((part) => part.type === "finish")).toEqual({
      type: "finish",
      finishReason: "content-filter",
    });
    await expect(started.terminal).resolves.toEqual({
      status: TURN_TERMINAL_STATUSES.BLOCKED,
      stepUsage: [usage(1, 0)],
      finishReason: "content-filter",
    });
  });

  it("keeps an empty assistant UIMessage on a completed terminal", async () => {
    const assistantMessage: UIMessage = {
      id: "turn-1-assistant",
      role: "assistant",
      parts: [],
    };
    const execution = createWorkflowTurnExecution(testSettings(), () =>
      Promise.resolve({
        runId: "run-1",
        stream: chunks({ type: "finish" }),
        terminal: Promise.resolve({
          status: CHAT_TURN_OUTCOMES.COMPLETED,
          assistantMessage,
          finishReason: "stop",
          usage: usage(1, 0),
        }),
      }),
    );

    const started = await execution.start(TURN_INPUT);

    await expect(started.terminal).resolves.toMatchObject({ assistantMessage });
  });
});

function chunks(...parts: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

async function readAll(
  stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> {
  const reader = stream.getReader();
  const output: UIMessageChunk[] = [];
  while (true) {
    const next = await reader.read();
    if (next.done) return output;
    output.push(next.value);
  }
}
