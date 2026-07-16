import type { UIMessageChunk } from "ai";
import type { ModelCallStreamPart } from "@ai-sdk/workflow";
import { HookNotFoundError, WorkflowRunNotFoundError } from "workflow/internal/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ModelProvider } from "#application/ports/model-provider";
import { TURN_CLAIM_DISPOSITIONS } from "#application/ports/turn/turn-store";
import type { ChatTurnExecutionDependencies } from "../chat-turn.js";

import {
  clientToolResultHookToken,
  didWorkflowAgentFail,
  executeChatTurn,
  preserveDynamicClientToolIdentity,
  stampAssistantMessageId,
  toChatTurnUIStream,
  toCompletedChatTurnOutcome,
} from "./chat-turn.js";
import { cancelChatTurn, wakeChatTurnProviderStep } from "./cancellation/index.js";

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 } as const;
const ACTIVITY_DURATION_MS = 1_501;
const claimExecutionMock = vi.fn<ChatTurnExecutionDependencies["claimExecution"]>();
const createAgentMock = vi.fn<ChatTurnExecutionDependencies["createAgent"]>();
const createHookMock = vi.fn<ChatTurnExecutionDependencies["createCancellationHook"]>();
const resolveRejectedClaimMock = vi.fn<ChatTurnExecutionDependencies["resolveRejectedClaim"]>();
const closeJournalMock = vi.fn<NonNullable<ChatTurnExecutionDependencies["closeJournal"]>>();

beforeEach(() => {
  claimExecutionMock.mockReset();
  createAgentMock.mockReset();
  createHookMock.mockReset();
  resolveRejectedClaimMock.mockReset();
  closeJournalMock.mockReset().mockResolvedValue(undefined);
});

describe("provider execution fence", () => {
  it("does not resolve or call a provider after the provider-boundary claim is fenced", async () => {
    claimExecutionMock
      .mockResolvedValueOnce(TURN_CLAIM_DISPOSITIONS.EXECUTE)
      .mockResolvedValueOnce(TURN_CLAIM_DISPOSITIONS.FENCED);
    createHookMock.mockReturnValue(new Promise<never>(() => undefined));
    resolveRejectedClaimMock.mockResolvedValue({
      status: "cancelled",
      reason: "product_turn_fenced",
    });
    const modelFor = vi.fn<ModelProvider["modelFor"]>(() => {
      throw new Error("Provider lookup must remain behind the durable fence.");
    });

    await expect(
      executeChatTurn(
        {
          workspaceId: "workspace-1",
          subjectId: "subject-1",
          conversationId: "conversation-1",
          turnId: "turn-1",
          requestId: "request-1",
          modelId: "model-1",
          instructions: "Answer safely.",
          maxSteps: 4,
          providerTimeoutMs: 30_000,
          clientToolTimeoutMs: 30_000,
          messages: [{ role: "user", content: "Hello" }],
          clientTools: [],
        },
        { modelFor },
        [],
        "postgres://test",
        {
          workflowRunId: () => "workflow-run-1",
          claimExecution: claimExecutionMock,
          resolveRejectedClaim: resolveRejectedClaimMock,
          createCancellationHook: createHookMock,
          createAgent: createAgentMock,
          closeJournal: closeJournalMock,
        },
      ),
    ).resolves.toEqual({ status: "cancelled", reason: "product_turn_fenced" });

    expect(claimExecutionMock).toHaveBeenCalledTimes(2);
    expect(modelFor).not.toHaveBeenCalled();
    expect(createAgentMock).not.toHaveBeenCalled();
    expect(closeJournalMock).toHaveBeenCalledOnce();
  });
});

describe("completed chat turn outcome", () => {
  it("recognizes a resolved WorkflowAgent error result as a failed run", () => {
    expect(didWorkflowAgentFail({ finishReason: "error" })).toBe(true);
    expect(didWorkflowAgentFail({ finishReason: "other" })).toBe(false);
    expect(didWorkflowAgentFail({ finishReason: "stop" })).toBe(false);
  });

  it("creates a stable empty assistant UIMessage when the model emits no content", () => {
    const outcome = toCompletedChatTurnOutcome("turn-1", 4, ACTIVITY_DURATION_MS, {
      steps: [{ content: [] }],
      finishReason: "stop",
      totalUsage: ZERO_USAGE,
    });

    expect(outcome).toMatchObject({
      status: "completed",
      finishReason: "stop",
      assistantMessage: {
        id: "turn-1-assistant",
        role: "assistant",
        parts: [],
      },
    });
  });

  it("preserves reasoning-only output as native assistant message parts", () => {
    const outcome = toCompletedChatTurnOutcome("turn-2", 4, ACTIVITY_DURATION_MS, {
      steps: [{ content: [{ type: "reasoning", text: "A private-safe summary" }] }],
      finishReason: "stop",
      totalUsage: ZERO_USAGE,
    });

    expect(outcome).toMatchObject({
      status: "completed",
      assistantMessage: {
        id: "turn-2-assistant",
        role: "assistant",
        parts: [{ type: "reasoning", text: "A private-safe summary" }],
      },
    });
  });

  it("maps a tool-call stop at the configured step cap to length", () => {
    const outcome = toCompletedChatTurnOutcome("turn-3", 2, ACTIVITY_DURATION_MS, {
      steps: [{ content: [] }, { content: [] }],
      finishReason: "tool-calls",
      totalUsage: ZERO_USAGE,
    });

    expect(outcome).toMatchObject({ finishReason: "length" });
  });

  it("does not call an ordinary one-step stop a step-limit finish", () => {
    const outcome = toCompletedChatTurnOutcome("turn-4", 1, ACTIVITY_DURATION_MS, {
      steps: [{ content: [{ type: "text", text: "Done" }] }],
      finishReason: "stop",
      totalUsage: ZERO_USAGE,
    });

    expect(outcome).toMatchObject({ finishReason: "stop" });
  });

  it("preserves available reasoning and cached-input usage details", () => {
    const outcome = toCompletedChatTurnOutcome("turn-5", 4, ACTIVITY_DURATION_MS, {
      steps: [{ content: [] }],
      finishReason: "stop",
      totalUsage: {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
        inputTokenDetails: { cacheReadTokens: 5 },
        outputTokenDetails: { reasoningTokens: 3 },
      },
    });

    expect(outcome).toMatchObject({
      usage: { reasoningTokens: 3, cachedInputTokens: 5 },
    });
  });
});

describe("client-tool Workflow compatibility", () => {
  it("uses a run-and-call-scoped hook token", () => {
    expect(clientToolResultHookToken("run-1", "call-1")).toBe("tool:run-1:call-1");
  });

  it("restores native dynamic identity after the pinned Workflow transform drops it", async () => {
    const stream = chunks(
      { type: "tool-input-start", toolCallId: "call-1", toolName: "open_file" },
      {
        type: "tool-input-delta",
        toolCallId: "call-1",
        inputTextDelta: '{"path":',
      },
      {
        type: "tool-input-available",
        toolCallId: "call-1",
        toolName: "open_file",
        input: { path: "README.md" },
      },
      {
        type: "tool-output-available",
        toolCallId: "call-1",
        output: { opened: true },
      },
      {
        type: "tool-input-start",
        toolCallId: "call-2",
        toolName: "server_search",
      },
    ).pipeThrough(
      preserveDynamicClientToolIdentity([
        {
          name: "open_file",
          description: "Open a file",
          inputSchema: { type: "object" },
        },
      ]),
    );

    await expect(readAll(stream)).resolves.toEqual([
      {
        type: "tool-input-start",
        toolCallId: "call-1",
        toolName: "open_file",
        dynamic: true,
      },
      {
        type: "tool-input-delta",
        toolCallId: "call-1",
        inputTextDelta: '{"path":',
        dynamic: true,
      },
      {
        type: "tool-input-available",
        toolCallId: "call-1",
        toolName: "open_file",
        input: { path: "README.md" },
        dynamic: true,
      },
      {
        type: "tool-output-available",
        toolCallId: "call-1",
        output: { opened: true },
        dynamic: true,
      },
      {
        type: "tool-input-start",
        toolCallId: "call-2",
        toolName: "server_search",
      },
    ]);
  });
});

describe("chat turn stream identity", () => {
  it("stamps the turn-scoped durable assistant id onto the live start chunk", async () => {
    const stream = chunks({ type: "start" }, { type: "start-step" }).pipeThrough(
      stampAssistantMessageId("turn-1-assistant"),
    );

    await expect(readAll(stream)).resolves.toEqual([
      { type: "start", messageId: "turn-1-assistant" },
      { type: "start-step" },
    ]);
  });

  it("converts durable model sources into native UI source chunks", async () => {
    const stream = modelParts({
      type: "source",
      sourceType: "url",
      id: "call-1:source:1",
      url: "https://example.test/source",
      title: "Example source",
    });

    await expect(
      readAll(toChatTurnUIStream(stream, [], "turn-1-assistant")),
    ).resolves.toContainEqual({
      type: "source-url",
      sourceId: "call-1:source:1",
      url: "https://example.test/source",
      title: "Example source",
    });
  });
});

describe("cancelChatTurn", () => {
  it("retries only the transient hook-registration race", async () => {
    const resume = vi
      .fn<(token: string, payload: { reason: string }) => Promise<void>>()
      .mockRejectedValueOnce(new HookNotFoundError("chat-turn-cancel:run-1"))
      .mockResolvedValueOnce(undefined);
    const waitForRetry = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const signalInFlightAbort = vi
      .fn<(runId: string) => Promise<boolean>>()
      .mockResolvedValue(true);

    await expect(
      cancelChatTurn("run-1", "user_requested_cancellation", {
        maxAttempts: 3,
        resume,
        signalInFlightAbort,
        waitForRetry,
      }),
    ).resolves.toBe(true);
    expect(resume).toHaveBeenCalledTimes(2);
    expect(signalInFlightAbort).toHaveBeenCalledWith("run-1");
    expect(waitForRetry).toHaveBeenCalledOnce();
  });

  it("records the durable cancel before waking the active provider step", async () => {
    const order: string[] = [];

    await expect(
      cancelChatTurn("run-1", "user_requested_cancellation", {
        maxAttempts: 1,
        resume: async () => {
          order.push("durable-hook");
        },
        signalInFlightAbort: async () => {
          order.push("provider-abort-stream");
          return true;
        },
        waitForRetry: () => Promise.resolve(),
      }),
    ).resolves.toBe(true);

    expect(order).toEqual(["durable-hook", "provider-abort-stream"]);
  });

  it("retries the provider wake when restart recovery registers its abort stream late", async () => {
    const signalInFlightAbort = vi
      .fn<(runId: string) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const waitForRetry = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      cancelChatTurn("run-1", "user_requested_cancellation", {
        maxAttempts: 3,
        resume: () => Promise.resolve(),
        signalInFlightAbort,
        waitForRetry,
      }),
    ).resolves.toBe(true);

    expect(signalInFlightAbort).toHaveBeenCalledTimes(2);
    expect(waitForRetry).toHaveBeenCalledOnce();
  });

  it("returns not found for a missing run without hiding infrastructure failures", async () => {
    const missing = vi
      .fn<(token: string, payload: { reason: string }) => Promise<void>>()
      .mockRejectedValue(new WorkflowRunNotFoundError("run-1"));
    await expect(
      cancelChatTurn("run-1", "user_requested_cancellation", {
        maxAttempts: 3,
        resume: missing,
        signalInFlightAbort: () => Promise.resolve(false),
        waitForRetry: () => Promise.resolve(),
      }),
    ).resolves.toBe(false);

    const unavailable = new Error("Workflow storage unavailable");
    await expect(
      cancelChatTurn("run-1", "user_requested_cancellation", {
        maxAttempts: 3,
        resume: () => Promise.reject(unavailable),
        signalInFlightAbort: () => Promise.resolve(false),
        waitForRetry: () => Promise.resolve(),
      }),
    ).rejects.toBe(unavailable);
  });
});

describe("wakeChatTurnProviderStep", () => {
  it("writes only the Workflow-owned system abort stream for the target run", async () => {
    const writeStream = vi
      .fn<(runId: string, streamName: string, chunk: Uint8Array) => Promise<void>>()
      .mockResolvedValue(undefined);

    await expect(
      wakeChatTurnProviderStep("run-1", {
        listHooks: () =>
          Promise.resolve([
            { isSystem: false, token: "chat-turn-cancel:run-1" },
            { isSystem: true, token: "abrt_01ABORT" },
          ]),
        writeStream,
      }),
    ).resolves.toBe(true);

    expect(writeStream).toHaveBeenCalledOnce();
    expect(writeStream).toHaveBeenCalledWith(
      "run-1",
      "strm_01ABORT_system_abort",
      Uint8Array.of(0),
    );
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

function modelParts(...parts: ModelCallStreamPart[]): ReadableStream<ModelCallStreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const output: UIMessageChunk[] = [];
  for await (const part of stream) output.push(part);
  return output;
}
