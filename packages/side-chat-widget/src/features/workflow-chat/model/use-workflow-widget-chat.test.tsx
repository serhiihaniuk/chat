import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    const onRunAccepted = vi.fn<(runId: string) => void>();
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
    });
    expect(chat.current?.terminal).toMatchObject({
      kind: "completed",
      messageId: "assistant-1",
      partCount: 2,
    });
    expect(onRunAccepted).toHaveBeenCalledWith("run-1");
    expect(onRunTerminal).toHaveBeenCalledWith("run-1");
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

  it("keeps a typed busy failure calm and does not retry", async () => {
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json(
          {
            code: "conversation_busy",
            message: "A turn is already active.",
            retryable: false,
          },
          { status: 409 },
        ),
      ),
    );
    const chat = renderChat({ fetch: request });

    await act(async () => chat.current?.submitMessage("Try once"));
    await waitFor(() => chat.current?.status === "error");

    expect(chat.current?.error).toMatchObject({
      code: "conversation_busy",
      message: "A turn is already active.",
      retryable: false,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("cancels the local reader and calls the server abort endpoint without an error state", async () => {
    const loggedError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let postSignal: AbortSignal | undefined;
    let cancelBody: unknown;
    const request = vi.fn<typeof fetch>((input, init) => {
      if (requestUrl(input).endsWith("/cancel")) {
        cancelBody = JSON.parse(requestBodyText(init?.body));
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      postSignal = init?.signal ?? undefined;
      if (postSignal?.aborted) return Promise.reject(new Error("Request was already aborted."));
      return Promise.resolve(openTurnResponse(postSignal));
    });
    const chat = renderChat({ fetch: request });

    act(() => {
      void chat.current?.submitMessage("Cancel this");
    });
    await waitFor(() => chat.current?.status === "streaming");
    act(() => chat.current?.stop());
    await waitFor(() => cancelBody !== undefined && chat.current?.cancelled === true);
    await waitFor(() => chat.current?.status === "idle");

    expect(postSignal?.aborted).toBe(true);
    expect(cancelBody).toEqual({ conversationId: "conversation-1" });
    expect(chat.current?.cancelled).toBe(true);
    expect(chat.current?.error).toBeUndefined();
    expect(chat.current?.status).toBe("idle");
    expect(chat.current?.terminal).toMatchObject({
      kind: "cancelled",
      messageId: "assistant-1",
    });
    expect(loggedError).not.toHaveBeenCalled();
  });

  it("keeps the run id for approve decisions after the approval stream pauses", async () => {
    let approvalBody: unknown;
    const onRunAccepted = vi.fn<(runId: string) => void>();
    const onRunTerminal = vi.fn<(runId: string) => void>();
    const request = vi.fn<typeof fetch>((input, init) => {
      const url = requestUrl(input);
      if (url.endsWith("/approvals/approval-1")) {
        approvalBody = JSON.parse(requestBodyText(init?.body));
        return Promise.resolve(
          Response.json({
            approvalId: "approval-1",
            state: "approved",
            accepted: true,
          }),
        );
      }
      return Promise.resolve(approvalTurnResponse());
    });
    const chat = renderChat({ fetch: request }, undefined, { onRunAccepted, onRunTerminal });

    await act(async () => chat.current?.submitMessage("Approve this"));
    await waitFor(() => chat.current?.status === "idle");

    expect(onRunAccepted).toHaveBeenCalledWith("run-1");
    expect(onRunTerminal).not.toHaveBeenCalled();

    await act(async () => chat.current?.decideApproval("approval-1", true, "Looks good"));

    expect(approvalBody).toEqual({ approved: true, reason: "Looks good" });
    expect(chat.current?.approvalDecisions).toMatchObject({
      "approval-1": "approved",
    });
    const renderedMessages = JSON.stringify(chat.current?.messages);
    expect(renderedMessages).toContain('"type":"tool-needs_access"');
    expect(renderedMessages).toContain('"state":"approval-responded"');
    expect(renderedMessages).toContain('"id":"approval-1"');
    expect(renderedMessages).toContain('"approved":true');
  });

  it("reattaches to a discovered run on cold load without duplicating seeded history", async () => {
    const urls: string[] = [];
    const request = vi.fn<typeof fetch>((input) => {
      urls.push(requestUrl(input));
      return Promise.resolve(completedTurnResponse());
    });
    const chat = renderChat({ fetch: request }, { runId: "run-1", turnId: "turn-1" });

    await waitFor(
      () => chat.current?.messages.some((message) => message.role === "assistant") ?? false,
    );

    expect(urls.some((url) => url.includes("/api/chat/run-1/stream"))).toBe(true);
    expect(chat.current?.messages.filter((message) => message.id === "seed-user")).toHaveLength(1);
    expect(chat.current?.messages.filter((message) => message.role === "assistant")).toHaveLength(
      1,
    );
  });

  it("surfaces a status-less connection error and clears it on reconnect", async () => {
    let failSend = true;
    const request = vi.fn<typeof fetch>((input) => {
      if (requestUrl(input).endsWith("/api/chat") && failSend) {
        failSend = false;
        return Promise.reject(new Error("network down"));
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

  it("retains an accepted run when its response stream loses transport", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onRunAccepted = vi.fn<(runId: string) => void>();
    const onRunTerminal = vi.fn<(runId: string) => void>();
    const request = vi.fn<typeof fetch>(() => Promise.resolve(interruptedTurnResponse()));
    const chat = renderChat({ fetch: request }, undefined, { onRunAccepted, onRunTerminal });

    await act(async () => chat.current?.submitMessage("Lose the stream"));
    await waitFor(() => chat.current?.error !== undefined);

    expect(onRunAccepted).toHaveBeenCalledWith("run-1");
    expect(onRunTerminal).not.toHaveBeenCalled();
  });
});

function renderChat(
  overrides: Partial<WorkflowConversationClient>,
  activeTurn?: WorkflowActiveTurn,
  lifecycle?: WorkflowWidgetChatLifecycle,
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
    current.current = useWorkflowWidgetChat(
      client,
      [SEEDED_MESSAGE],
      undefined,
      activeTurn,
      lifecycle,
    );
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

function completedTurnResponse(): Response {
  return eventResponse(
    [
      { type: "start", messageId: "assistant-1" },
      { type: "start-step" },
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "Answer" },
      { type: "text-end", id: "text-1" },
      { type: "finish-step" },
      {
        type: "finish",
        messageMetadata: {
          usage: {
            inputTokens: 2,
            outputTokens: 3,
            totalTokens: 5,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          },
        },
      },
    ]
      .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
      .join("") + "data: [DONE]\n\n",
  );
}

function openTurnResponse(signal: AbortSignal | undefined): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          [
            { type: "start", messageId: "assistant-1" },
            { type: "start-step" },
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: "Partial" },
          ]
            .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
            .join(""),
        ),
      );
      signal?.addEventListener("abort", () => controller.error(signal.reason), {
        once: true,
      });
    },
  });
  return eventResponse(body);
}

function blockedTurnResponse(): Response {
  return eventResponse(
    [
      { type: "start", messageId: "assistant-1" },
      { type: "start-step" },
      { type: "finish-step" },
      { type: "finish", finishReason: "content-filter" },
    ]
      .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
      .join("") + "data: [DONE]\n\n",
  );
}

function interruptedTurnResponse(): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error("network down after acceptance"));
    },
  });
  return eventResponse(body);
}

function approvalTurnResponse(): Response {
  return eventResponse(
    [
      { type: "start", messageId: "assistant-1" },
      { type: "start-step" },
      {
        type: "tool-input-available",
        toolCallId: "tool-call-1",
        toolName: "needs_access",
        input: { resourceId: "doc-1" },
      },
      {
        type: "tool-approval-request",
        approvalId: "approval-1",
        toolCallId: "tool-call-1",
      },
      { type: "finish-step" },
      { type: "finish" },
    ]
      .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
      .join("") + "data: [DONE]\n\n",
  );
}

function eventResponse(body: BodyInit): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
      "x-workflow-run-id": "run-1",
    },
  });
}

function readSentMessageIds(body: BodyInit | null | undefined): string[] {
  const parsed: unknown = JSON.parse(requestBodyText(body));
  if (!isRecord(parsed) || !Array.isArray(parsed["messages"])) {
    throw new Error("Expected a workflow chat request with messages.");
  }
  return parsed["messages"].map((message) => {
    if (!isRecord(message) || typeof message["id"] !== "string") {
      throw new Error("Expected every workflow chat message to have an id.");
    }
    return message["id"];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function requestBodyText(body: BodyInit | null | undefined): string {
  if (typeof body === "string") return body;
  throw new Error("Expected a JSON request body.");
}
