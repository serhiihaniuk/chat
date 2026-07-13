import { describe, expect, it, vi } from "vitest";

import type { UIMessage, UIMessageChunk } from "ai";

import { normalizeWorkflowChatError, type WorkflowChatClient } from "../index.js";
import {
  createWorkflowChatTransport,
  type WorkflowClientToolDefinition,
} from "./workflow-chat-transport.js";

const USER_MESSAGE: UIMessage = {
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text: "Hello" }],
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
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return finishedResponse();
    });
    const transport = createTransport({ fetch: request }, () => [
      {
        name: "open_resource",
        description: "Open a host resource.",
        inputSchema: { type: "object" },
      },
    ]);

    await sendAndRead(transport, [USER_MESSAGE]);

    expect(requestBody).toEqual(
      expect.objectContaining({
        clientTools: [
          {
            name: "open_resource",
            description: "Open a host resource.",
            inputSchema: { type: "object" },
          },
        ],
      }),
    );
  });

  it("surfaces a typed busy response without retrying", async () => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          code: "conversation_busy",
          message: "A turn is already active.",
          retryable: false,
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
      code: "conversation_busy",
      message: "A turn is already active.",
      retryable: false,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reattaches to the discovered run's stream on a cold-load reconnect", async () => {
    const urls = await reconnectUrls(() => "discovered-run");

    expect(urls.some((url) => url.includes("/api/chat/discovered-run/stream"))).toBe(true);
  });

  it("falls back to the conversation stream when discovery found no run", async () => {
    const urls = await reconnectUrls(undefined);

    expect(urls.some((url) => url.includes("/api/chat/conversation-1/stream"))).toBe(true);
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
  const client: WorkflowChatClient = {
    baseUrl: "https://service.example",
    conversationId: "conversation-1",
    fetch: request,
  };
  const transport = createWorkflowChatTransport({
    getClient: () => client,
    getReconnectRunId,
    onRunFinished: () => undefined,
    onRunStarted: () => undefined,
  });
  await readAll(await transport.reconnectToStream({ chatId: "conversation-1" }));
  return urls;
}

const KEEPALIVE = Symbol("keepalive");

function createTransport(
  overrides: Partial<WorkflowChatClient>,
  getClientTools?: () => readonly WorkflowClientToolDefinition[],
) {
  const client: WorkflowChatClient = {
    baseUrl: "https://service.example",
    conversationId: "conversation-1",
    ...overrides,
  };
  return createWorkflowChatTransport({
    getClient: () => client,
    getClientTools,
    onRunFinished: () => undefined,
    onRunStarted: () => undefined,
  });
}

function sendOptions(messages: UIMessage[]) {
  return {
    trigger: "submit-message" as const,
    chatId: "conversation-1",
    messageId: undefined,
    messages,
    abortSignal: undefined,
  };
}

async function sendAndRead(
  transport: ReturnType<typeof createTransport>,
  messages: UIMessage[],
): Promise<UIMessageChunk[]> {
  return readAll(await transport.sendMessages(sendOptions(messages)));
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
