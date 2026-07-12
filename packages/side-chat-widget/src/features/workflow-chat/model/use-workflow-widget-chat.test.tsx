import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UIMessage } from "ai";

import type { WorkflowChatClient } from "#entities/workflow-chat";
import { useWorkflowWidgetChat, type WorkflowWidgetChat } from "./use-workflow-widget-chat.js";

const SEEDED_MESSAGE: UIMessage = {
  id: "seed-user",
  role: "user",
  parts: [{ type: "text", text: "Earlier" }],
};

let windowRef: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  windowRef = new Window();
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowRef });
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
    const request = vi.fn<typeof fetch>((_input, init) => {
      sentMessageIds = readSentMessageIds(init?.body);
      return Promise.resolve(completedTurnResponse());
    });
    const chat = renderChat({ fetch: request });

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
  });

  it("keeps a typed busy failure calm and does not retry", async () => {
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json(
          { code: "conversation_busy", message: "A turn is already active.", retryable: false },
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
    expect(loggedError).not.toHaveBeenCalled();
  });
});

function renderChat(overrides: Partial<WorkflowChatClient>) {
  const current: { current: WorkflowWidgetChat | undefined } = { current: undefined };
  const client: WorkflowChatClient = {
    baseUrl: "https://service.example",
    conversationId: "conversation-1",
    ...overrides,
  };
  const Probe = () => {
    current.current = useWorkflowWidgetChat(client, [SEEDED_MESSAGE]);
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
      { type: "finish" },
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
      signal?.addEventListener("abort", () => controller.error(signal.reason), { once: true });
    },
  });
  return eventResponse(body);
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
