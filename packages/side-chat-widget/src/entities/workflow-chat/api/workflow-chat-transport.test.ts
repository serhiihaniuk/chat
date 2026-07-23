import { describe, expect, it, vi } from "vitest";

import type { UIMessageChunk } from "ai";
import type { HostContextRequest, WidgetHostBridge } from "@side-chat/host-bridge";
import {
  SIDE_CHAT_CLIENT_TOOL_CAPABILITY,
  SIDE_CHAT_ERROR_CODES,
  SIDE_CHAT_ERROR_VOCABULARY,
} from "@side-chat/stream-profile";

import {
  normalizeWorkflowChatError,
  type WorkflowConversationClient,
  type WorkflowUIMessage,
} from "../index.js";
import {
  createWorkflowChatTransport,
  type WorkflowClientToolDefinition,
} from "./workflow-chat-transport.js";

const USER_MESSAGE: WorkflowUIMessage = {
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text: "Hello" }],
};
const CLIENT_TOOL: WorkflowClientToolDefinition = {
  name: "open_resource",
  description: "Open a host resource.",
  inputSchema: { type: "object" },
};

describe("createWorkflowChatTransport", () => {
  it("sends the strict service envelope and ignores keepalive comments", async () => {
    let requestBody: unknown;
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return streamResponse([
        { type: "start", messageId: "assistant-1" },
        { type: "start-step" },
        { type: "text-start", id: "text-1" },
        KEEPALIVE,
        { type: "text-delta", id: "text-1", delta: "Hi" },
        { type: "text-end", id: "text-1" },
        { type: "finish-step" },
        { type: "finish" },
      ]);
    });
    const transport = createTransport({ fetch: request });

    const chunks = await sendAndRead(transport, [USER_MESSAGE]);

    expect(request).toHaveBeenCalledTimes(1);
    expect(requestBody).toEqual({
      requestId: expect.any(String),
      conversationId: "conversation-1",
      messages: [USER_MESSAGE],
    });
    expect(chunks).toContainEqual({
      type: "text-delta",
      id: "text-1",
      delta: "Hi",
    });
    expect(chunks.some((chunk) => chunk.type === "finish")).toBe(true);
    expect(chunks).toHaveLength(7);
  });

  it("resolves current auth configuration for every request", async () => {
    let token = "first";
    const authorization: string[] = [];
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      authorization.push(new Headers(init?.headers).get("authorization") ?? "");
      return finishedResponse();
    });
    const transport = createTransport({
      fetch: request,
      getRequestConfig: () => ({
        headers: { authorization: `Bearer ${token}` },
      }),
    });

    await sendAndRead(transport, [USER_MESSAGE]);
    token = "refreshed";
    await sendAndRead(transport, [USER_MESSAGE]);

    expect(authorization).toEqual(["Bearer first", "Bearer refreshed"]);
  });
  it("includes the current native client-tool catalog in the workflow envelope", async () => {
    let requestBody: unknown;
    let clientToolCapability: string | null = null;
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      clientToolCapability = new Headers(init?.headers).get(
        SIDE_CHAT_CLIENT_TOOL_CAPABILITY.HEADER,
      );
      return finishedResponse();
    });
    const transport = createTransport({ fetch: request }, () => [CLIENT_TOOL]);

    await sendAndRead(transport, [USER_MESSAGE]);

    expect(requestBody).toMatchObject({
      clientTools: [CLIENT_TOOL],
    });
    expect(clientToolCapability).toBe("a".repeat(64));
  });

  it("collects one fresh correlated host-context snapshot for each send and regeneration", async () => {
    const requestBodies: unknown[] = [];
    const contextRequests: HostContextRequest[] = [];
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)));
      return finishedResponse();
    });
    const getHostContext = vi.fn<NonNullable<WidgetHostBridge["getContext"]>>(({ requestId }) => {
      contextRequests.push({ requestId });
      return Promise.resolve({
        schemaVersion: "test.host-context.v1",
        title: `Snapshot ${contextRequests.length}`,
      });
    });
    const transport = createTransport({ fetch: request }, undefined, getHostContext);

    await sendAndRead(transport, [USER_MESSAGE]);
    await sendAndRead(transport, [USER_MESSAGE], "regenerate-message");

    const first = readRequestRecord(requestBodies[0]);
    const second = readRequestRecord(requestBodies[1]);
    expect(first["requestId"]).not.toBe(second["requestId"]);
    expect(contextRequests).toEqual([
      { requestId: first["requestId"] },
      { requestId: second["requestId"] },
    ]);
    expect(first["hostContext"]).toEqual({
      schemaVersion: "test.host-context.v1",
      title: "Snapshot 1",
    });
    expect(second["hostContext"]).toEqual({
      schemaVersion: "test.host-context.v1",
      title: "Snapshot 2",
    });
  });

  it("rejects a failed host-context collection before starting the workflow request", async () => {
    const request = vi.fn<typeof fetch>(() => Promise.resolve(finishedResponse()));
    const getHostContext = vi.fn<NonNullable<WidgetHostBridge["getContext"]>>(() =>
      Promise.reject(new Error("Host context is unavailable.")),
    );
    const transport = createTransport({ fetch: request }, undefined, getHostContext);

    await expect(sendAndRead(transport, [USER_MESSAGE])).rejects.toThrow(
      "Host context is unavailable.",
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("serializes the current model and its catalog-selected reasoning effort", async () => {
    let requestBody: unknown;
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return finishedResponse();
    });
    const transport = createTransport({
      fetch: request,
      modelPreference: "gpt-5.6-luna",
      reasoningEffort: "high",
    });

    await sendAndRead(transport, [USER_MESSAGE]);

    expect(requestBody).toEqual(
      expect.objectContaining({
        modelPreference: "gpt-5.6-luna",
        reasoningEffort: "high",
      }),
    );
  });

  it("serializes the selected server tools, including an explicit empty selection", async () => {
    const requestBodies: unknown[] = [];
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)));
      return finishedResponse();
    });
    const selected = createTransport({
      fetch: request,
      enabledToolNames: ["web_search"],
    });
    await sendAndRead(selected, [USER_MESSAGE]);
    const none = createTransport({ fetch: request, enabledToolNames: [] });
    await sendAndRead(none, [USER_MESSAGE]);

    expect(requestBodies).toEqual([
      expect.objectContaining({ enabledToolNames: ["web_search"] }),
      expect.objectContaining({ enabledToolNames: [] }),
    ]);
  });

  it("surfaces the public conflict response without automatically retrying", async () => {
    const conflict = SIDE_CHAT_ERROR_VOCABULARY[SIDE_CHAT_ERROR_CODES.CONFLICT];
    const request = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          code: SIDE_CHAT_ERROR_CODES.CONFLICT,
          message: conflict.safeMessage,
          retryable: conflict.retryable,
        },
        { status: 409 },
      ),
    );
    const transport = createTransport({ fetch: request });

    const stream = await transport.sendMessages(sendOptions([USER_MESSAGE]));
    let thrown: unknown;
    try {
      await readAll(stream);
    } catch (error) {
      thrown = error;
    }

    expect(normalizeWorkflowChatError(thrown)).toMatchObject({
      code: SIDE_CHAT_ERROR_CODES.CONFLICT,
      message: conflict.safeMessage,
      retryable: conflict.retryable,
      status: 409,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps reconnecting through bounded stream failures and reports each HTTP recovery", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const transitions: string[] = [];
    const onReconnectStarted = vi.fn<() => void>(() => {
      transitions.push("reconnecting");
    });
    const onReconnectConnected = vi.fn<() => void>(() => {
      transitions.push("connected");
    });
    let attempt = 0;
    const authorizations: Array<string | null> = [];
    const request = vi.fn<typeof fetch>((_input, init) => {
      authorizations.push(new Headers(init?.headers).get("authorization"));
      attempt += 1;
      if (attempt < 3) return Promise.resolve(failedStreamResponse());
      return Promise.resolve(finishedResponse());
    });
    const client: WorkflowConversationClient = {
      baseUrl: "https://service.example",
      scopeKey: "test-scope",
      conversationId: "conversation-1",
      fetch: request,
      getRequestConfig: () => ({ headers: { authorization: "Bearer current" } }),
      maxConsecutiveErrors: 3,
    };
    const transport = createWorkflowChatTransport({
      getClient: () => client,
      getReconnectRunId: () => "run-1",
      onReconnectConnected,
      onReconnectStarted,
      onRunFinished: () => undefined,
      onRunStarted: () => undefined,
    });

    await reconnectAndRead(transport);

    expect(authorizations).toEqual(["Bearer current", "Bearer current", "Bearer current"]);
    expect(transitions).toEqual([
      "reconnecting",
      "connected",
      "reconnecting",
      "connected",
      "reconnecting",
      "connected",
    ]);
  });

  it("reattaches to the discovered run's stream on a cold-load reconnect", async () => {
    const urls = await reconnectUrls(() => "discovered-run");

    expect(urls.some((url) => url.includes("/api/chat/discovered-run/stream"))).toBe(true);
  });

  it("falls back to the conversation stream when discovery found no run", async () => {
    const urls = await reconnectUrls(undefined);

    expect(urls.some((url) => url.includes("/api/chat/conversation-1/stream"))).toBe(true);
  });

  it("does not recollect page context while reconnecting to an existing run", async () => {
    const request = vi.fn<typeof fetch>(() => Promise.resolve(finishedResponse()));
    const getHostContext = vi.fn<NonNullable<WidgetHostBridge["getContext"]>>(() =>
      Promise.resolve({ schemaVersion: "test.host-context.v1" }),
    );
    const transport = createTransport({ fetch: request }, undefined, getHostContext);

    await reconnectAndRead(transport);

    expect(getHostContext).not.toHaveBeenCalled();
  });

  it("forwards the reconnect abort signal to the workflow request", async () => {
    let requestSignal: AbortSignal | null | undefined;
    const request = vi.fn<typeof fetch>((_input, init) => {
      requestSignal = init?.signal;
      return Promise.resolve(finishedResponse());
    });
    const transport = createTransport({ fetch: request });
    const controller = new AbortController();

    const stream = await transport.reconnectToStream({
      abortSignal: controller.signal,
      chatId: "conversation-1",
    });
    if (!stream) throw new Error("Expected a workflow reconnect stream.");
    await readAll(stream);

    expect(requestSignal).toBe(controller.signal);
  });
});

async function reconnectUrls(
  getReconnectRunId: (() => string | undefined) | undefined,
): Promise<string[]> {
  const urls: string[] = [];
  const request = vi.fn<typeof fetch>(async (input) => {
    urls.push(String(input));
    return finishedResponse();
  });
  const client: WorkflowConversationClient = {
    baseUrl: "https://service.example",
    scopeKey: "test-scope",
    conversationId: "conversation-1",
    fetch: request,
  };
  const transport = createWorkflowChatTransport({
    getClient: () => client,
    getReconnectRunId,
    onRunFinished: () => undefined,
    onRunStarted: () => undefined,
  });
  await reconnectAndRead(transport);
  return urls;
}

const KEEPALIVE = Symbol("keepalive");

function createTransport(
  overrides: Partial<WorkflowConversationClient>,
  getClientTools?: () => readonly WorkflowClientToolDefinition[],
  getHostContext?: NonNullable<WidgetHostBridge["getContext"]>,
) {
  const client: WorkflowConversationClient = {
    baseUrl: "https://service.example",
    conversationId: "conversation-1",
    ...overrides,
    scopeKey: overrides.scopeKey ?? "test-scope",
  };
  return createWorkflowChatTransport({
    clientToolCapability: "a".repeat(64),
    getClient: () => client,
    getClientTools,
    getHostContext,
    onRunFinished: () => undefined,
    onRunStarted: () => undefined,
  });
}

function sendOptions(
  messages: WorkflowUIMessage[],
  trigger: "submit-message" | "regenerate-message" = "submit-message",
) {
  return {
    trigger,
    chatId: "conversation-1",
    messageId: undefined,
    messages,
    abortSignal: undefined,
  };
}

async function sendAndRead(
  transport: ReturnType<typeof createTransport>,
  messages: WorkflowUIMessage[],
  trigger: "submit-message" | "regenerate-message" = "submit-message",
): Promise<UIMessageChunk[]> {
  return readAll(await transport.sendMessages(sendOptions(messages, trigger)));
}

function readRequestRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("Expected a workflow request object.");
  }
  return value;
}

async function reconnectAndRead(transport: ReturnType<typeof createTransport>): Promise<void> {
  const stream = await transport.reconnectToStream({ chatId: "conversation-1" });
  if (!stream) throw new Error("Expected a workflow reconnect stream.");
  await readAll(stream);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readAll(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const result = await reader.read();
    if (result.done) return chunks;
    chunks.push(result.value);
  }
}

function finishedResponse(): Response {
  return streamResponse([{ type: "start", messageId: "assistant-1" }, { type: "finish" }]);
}

function failedStreamResponse(): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new Error("stream disconnected"));
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
      },
    },
  );
}

function streamResponse(chunks: readonly (UIMessageChunk | typeof KEEPALIVE)[]): Response {
  const body = chunks
    .map((chunk) =>
      chunk === KEEPALIVE ? ": keepalive\n\n" : `data: ${JSON.stringify(chunk)}\n\n`,
    )
    .join("");
  return new Response(`${body}data: [DONE]\n\n`, {
    headers: {
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
      "x-workflow-run-id": "run-1",
    },
  });
}
