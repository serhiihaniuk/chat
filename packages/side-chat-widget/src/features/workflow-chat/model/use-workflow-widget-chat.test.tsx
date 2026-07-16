import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SIDE_CHAT_ERROR_CODES, SIDE_CHAT_ERROR_VOCABULARY } from "@side-chat/stream-profile";

import type {
  WorkflowActiveTurn,
  WorkflowConversationClient,
  WorkflowUIMessage,
} from "#entities/workflow-chat";
import {
  useWorkflowWidgetChat,
  type WorkflowWidgetChat,
  type WorkflowWidgetChatLifecycle,
} from "./use-workflow-widget-chat.js";
import {
  approvalTurnResponse,
  blockedTurnResponse,
  cancellableTurnResponse,
  completedTurnResponse,
  interruptedTurnResponse,
  openTurnResponse,
  readSentMessageIds,
  requestBodyText,
  requestUrl,
} from "#testing/workflow-chat/workflow-widget-chat.test-support";

const SEEDED_MESSAGE: WorkflowUIMessage = {
  id: "seed-user",
  role: "user",
  parts: [{ type: "text", text: "Earlier" }],
};

let windowRef: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  windowRef = new Window();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowRef,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: windowRef.document,
  });
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  windowRef.close();
  vi.restoreAllMocks();
});

describe("useWorkflowWidgetChat", () => {
  it("seeds history once and finishes with exactly one streamed assistant", async () => {
    let sentMessageIds: string[] = [];
    const onRunAccepted = vi.fn<(runId: string, clientToolCapability: string) => void>();
    const onRunTerminal = vi.fn<(runId: string) => void>();
    const request = vi.fn<typeof fetch>((_input, init) => {
      sentMessageIds = readSentMessageIds(init?.body);
      return Promise.resolve(completedTurnResponse());
    });
    const chat = renderChat({ fetch: request }, undefined, { onRunAccepted, onRunTerminal });

    await act(async () => chat.current?.submitMessage("Now"));
    await waitFor(() => chat.current?.status === "idle");

    expect(sentMessageIds).toEqual(["seed-user", expect.any(String)]);
    const assistantMessages = chat.current?.messages.filter(
      (message) => message.role === "assistant",
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages?.[0]?.id).toBe("assistant-1");
    expect(assistantMessages?.[0]?.parts).toContainEqual(
      expect.objectContaining({ type: "text", text: "Answer", state: "done" }),
    );
    expect(chat.current?.messages.filter((message) => message.id === "seed-user")).toHaveLength(1);
    expect(
      chat.current?.messages.find((message) => message.id === "assistant-1")?.metadata,
    ).toEqual({
      usage: {
        inputTokens: 2,
        outputTokens: 3,
        totalTokens: 5,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      },
      terminal: { status: "completed", finishReason: "stop" },
    });
    expect(chat.current?.terminal).toMatchObject({
      kind: "completed",
      messageId: "assistant-1",
      partCount: 2,
    });
    expect(onRunAccepted).toHaveBeenCalledWith("run-1", expect.any(String));
    expect(onRunTerminal).toHaveBeenCalledWith("run-1");
  });

  it("reconstructs a failed partial terminal from durable history", () => {
    const partial: WorkflowUIMessage = {
      id: "turn-1-assistant",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "Started thinking" },
        { type: "text", text: "Partial answer" },
      ],
      metadata: {
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        terminal: { status: "failed", errorCode: "timeout" },
      },
    };

    const chat = renderChat({}, undefined, undefined, [SEEDED_MESSAGE, partial]);

    expect(chat.current?.messages).toEqual([SEEDED_MESSAGE, partial]);
    expect(chat.current?.terminal).toEqual({
      kind: "error",
      code: "timeout",
      message: "A bounded operation exceeded its deadline.",
      messageId: "turn-1-assistant",
      partCount: 2,
      retryable: true,
    });
  });

  it("maps a native content-filter finish to a blocked terminal", async () => {
    const request = vi.fn<typeof fetch>(() => Promise.resolve(blockedTurnResponse()));
    const chat = renderChat({ fetch: request });

    await act(async () => chat.current?.submitMessage("Blocked"));
    await waitFor(() => chat.current?.status === "idle");

    expect(chat.current?.terminal).toMatchObject({
      kind: "blocked",
      messageId: "assistant-1",
    });
    expect(chat.current?.error).toBeUndefined();
  });

  it("keeps a public conflict failure bounded without automatic retry", async () => {
    const conflict = SIDE_CHAT_ERROR_VOCABULARY[SIDE_CHAT_ERROR_CODES.CONFLICT];
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json(
          {
            code: SIDE_CHAT_ERROR_CODES.CONFLICT,
            message: conflict.safeMessage,
            retryable: conflict.retryable,
          },
          { status: 409 },
        ),
      ),
    );
    const chat = renderChat({ fetch: request });

    await act(async () => chat.current?.submitMessage("Try once"));
    await waitFor(() => chat.current?.status === "error");

    expect(chat.current?.error).toMatchObject({
      code: SIDE_CHAT_ERROR_CODES.CONFLICT,
      message: conflict.safeMessage,
      retryable: conflict.retryable,
      status: 409,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps cancel provisional until the server confirms a terminal", async () => {
    const loggedError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let postSignal: AbortSignal | undefined;
    let cancelBody: unknown;
    const turn = cancellableTurnResponse();
    const request = vi.fn<typeof fetch>((input, init) => {
      if (requestUrl(input).endsWith("/cancel")) {
        cancelBody = JSON.parse(requestBodyText(init?.body));
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      postSignal = init?.signal ?? undefined;
      if (postSignal?.aborted) return Promise.reject(new Error("Request was already aborted."));
      return Promise.resolve(turn.response);
    });
    const chat = renderChat({ fetch: request });

    act(() => {
      void chat.current?.submitMessage("Cancel this");
    });
    await waitFor(() => chat.current?.status === "streaming");
    act(() => chat.current?.stop());
    await waitFor(() => cancelBody !== undefined && chat.current?.cancelled === true);

    expect(postSignal?.aborted).toBe(false);
    expect(cancelBody).toEqual({ conversationId: "conversation-1" });
    expect(chat.current?.cancelled).toBe(true);
    expect(chat.current?.error).toBeUndefined();

    act(() => turn.confirmCancelled());
    await waitFor(() => chat.current?.terminal.kind === "cancelled");

    expect(chat.current?.status).toBe("idle");
    expect(chat.current?.cancelled).toBe(false);
    expect(chat.current?.terminal).toMatchObject({ kind: "cancelled" });
    expect(loggedError).not.toHaveBeenCalled();
  });

  it("latches Stop before the response exposes a run id", async () => {
    const loggedError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let resolveTurn: ((response: Response) => void) | undefined;
    let postSignal: AbortSignal | undefined;
    let cancelBody: unknown;
    const request = vi.fn<typeof fetch>((input, init) => {
      if (requestUrl(input).endsWith("/cancel")) {
        cancelBody = JSON.parse(requestBodyText(init?.body));
        return Promise.resolve(Response.json({ cancelled: true, runId: "run-1" }));
      }
      postSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        resolveTurn = resolve;
      });
    });
    const chat = renderChat({ fetch: request });

    act(() => {
      void chat.current?.submitMessage("Cancel before acceptance");
    });
    await waitFor(() => chat.current?.phase === "submitted");
    act(() => chat.current?.stop());

    expect(chat.current?.cancelled).toBe(true);
    expect(cancelBody).toBeUndefined();

    await waitFor(() => resolveTurn !== undefined);
    act(() => resolveTurn?.(openTurnResponse(postSignal)));
    await waitFor(() => cancelBody !== undefined);

    expect(cancelBody).toEqual({ conversationId: "conversation-1" });
    expect(postSignal?.aborted).toBe(false);
    expect(chat.current?.cancelled).toBe(true);
    expect(loggedError).not.toHaveBeenCalled();
  });

  it("keeps the run id for approve decisions after the approval stream pauses", async () => {
    let approvalBody: unknown;
    let resolveApproval: ((response: Response) => void) | undefined;
    const approvalResponse = new Promise<Response>((resolve) => {
      resolveApproval = resolve;
    });
    const onRunAccepted = vi.fn<(runId: string, clientToolCapability: string) => void>();
    const onRunTerminal = vi.fn<(runId: string) => void>();
    const request = vi.fn<typeof fetch>((input, init) => {
      const url = requestUrl(input);
      if (url.endsWith("/approvals/approval-1")) {
        approvalBody = JSON.parse(requestBodyText(init?.body));
        return approvalResponse;
      }
      return Promise.resolve(approvalTurnResponse());
    });
    const chat = renderChat({ fetch: request }, undefined, { onRunAccepted, onRunTerminal });

    await act(async () => chat.current?.submitMessage("Approve this"));
    await waitFor(() =>
      JSON.stringify(chat.current?.messages).includes('"state":"approval-requested"'),
    );

    expect(onRunAccepted).toHaveBeenCalledWith("run-1", expect.any(String));
    expect(onRunTerminal).not.toHaveBeenCalled();

    let decisionRequest: Promise<void> | undefined;
    act(() => {
      decisionRequest = chat.current?.decideApproval("approval-1", true);
    });

    await waitFor(() => chat.current?.approvalDecisions["approval-1"] === "approved");
    expect(chat.current?.approvalDecisions).toMatchObject({
      "approval-1": "approved",
    });
    act(() =>
      resolveApproval?.(
        Response.json({
          approvalId: "approval-1",
          state: "approved",
          accepted: true,
        }),
      ),
    );
    await act(async () => decisionRequest);

    expect(approvalBody).toEqual({ approved: true });
    expect(chat.current?.approvalDecisions).toMatchObject({
      "approval-1": "approved",
    });
    await waitFor(() =>
      JSON.stringify(chat.current?.messages).includes('"state":"approval-requested"'),
    );
    const renderedMessages = JSON.stringify(chat.current?.messages);
    expect(renderedMessages).toContain('"type":"tool-needs_access"');
    expect(renderedMessages).toContain('"state":"approval-requested"');
    expect(renderedMessages).not.toContain('"state":"approval-responded"');
  });

  it("surfaces a status-less connection error and clears it on reconnect", async () => {
    let failSend = true;
    const request = vi.fn<typeof fetch>((input) => {
      const url = requestUrl(input);
      if (url.endsWith("/api/chat") && failSend) {
        failSend = false;
        return Promise.reject(new Error("network down"));
      }
      if (url.endsWith("/api/conversations/conversation-1/state")) {
        return Promise.resolve(Response.json({ activeTurn: null, messages: [SEEDED_MESSAGE] }));
      }
      return Promise.resolve(completedTurnResponse());
    });
    const chat = renderChat({ fetch: request });

    await act(async () => chat.current?.submitMessage("Hi"));
    await waitFor(() => chat.current?.error !== undefined);
    expect(chat.current?.error?.status).toBeUndefined();

    await act(async () => chat.current?.reconnect());
    await waitFor(() => chat.current?.error === undefined);
  });

  it("shows automatic replay as reattaching until its HTTP response connects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let resolveReplay: ((response: Response) => void) | undefined;
    const request = vi.fn<typeof fetch>((input) => {
      if (requestUrl(input).includes("/stream?")) {
        return new Promise<Response>((resolve) => {
          resolveReplay = resolve;
        });
      }
      return Promise.resolve(interruptedTurnResponse());
    });
    const chat = renderChat({ fetch: request });

    act(() => {
      void chat.current?.submitMessage("Recover automatically");
    });
    await waitFor(() => chat.current?.phase === "reattaching");
    expect(chat.current?.error).toBeUndefined();

    act(() => resolveReplay?.(completedTurnResponse()));
    await waitFor(() => chat.current?.terminal.kind === "completed");

    expect(chat.current?.phase).toBe("settling");
    expect(chat.current?.error).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("replaces an exhausted accepted-run attachment during manual reconnect", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let recoveryStarted = false;
    const request = vi.fn<typeof fetch>((input) => {
      const url = requestUrl(input);
      if (url.endsWith("/state")) {
        recoveryStarted = true;
        return Promise.resolve(
          Response.json({
            activeTurn: { runId: "run-1", turnId: "turn-1" },
            messages: [SEEDED_MESSAGE],
          }),
        );
      }
      return Promise.resolve(recoveryStarted ? completedTurnResponse() : interruptedTurnResponse());
    });
    const chat = renderChat({ fetch: request, maxConsecutiveErrors: 2 });

    await act(async () => chat.current?.submitMessage("Exhaust replay"));
    await waitFor(() => chat.current?.error !== undefined);
    expect(chat.current?.phase).toBe("error");

    await act(async () => chat.current?.reconnect());
    await waitFor(() => chat.current?.status === "idle");

    expect(chat.current?.error).toBeUndefined();
    expect(chat.current?.messages.some((message) => message.id === "assistant-1")).toBe(true);
  });

  it("retains an accepted run when its response stream loses transport", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onRunAccepted = vi.fn<(runId: string, clientToolCapability: string) => void>();
    const onRunTerminal = vi.fn<(runId: string) => void>();
    const request = vi.fn<typeof fetch>(() => Promise.resolve(interruptedTurnResponse()));
    const chat = renderChat({ fetch: request }, undefined, { onRunAccepted, onRunTerminal });

    await act(async () => chat.current?.submitMessage("Lose the stream"));
    await waitFor(() => chat.current?.error !== undefined);

    expect(onRunAccepted).toHaveBeenCalledWith("run-1", expect.any(String));
    expect(onRunTerminal).not.toHaveBeenCalled();
  });
});

function renderChat(
  overrides: Partial<WorkflowConversationClient>,
  activeTurn?: WorkflowActiveTurn,
  lifecycle?: WorkflowWidgetChatLifecycle,
  initialMessages: readonly WorkflowUIMessage[] = [SEEDED_MESSAGE],
  stateObservationId?: string,
) {
  const current: { current: WorkflowWidgetChat | undefined } = {
    current: undefined,
  };
  const client: WorkflowConversationClient = {
    baseUrl: "https://service.example",
    conversationId: "conversation-1",
    ...overrides,
  };
  const Probe = () => {
    current.current = useWorkflowWidgetChat({
      activeTurn,
      client,
      initialMessages,
      lifecycle,
      stateObservationId,
    });
    return null;
  };
  act(() => root.render(createElement(Probe)));
  return current;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await act(async () => Promise.resolve());
  }
  throw new Error("Timed out waiting for chat state.");
}
