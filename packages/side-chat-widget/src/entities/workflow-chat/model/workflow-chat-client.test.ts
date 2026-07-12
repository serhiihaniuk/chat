import { describe, expect, it, vi } from "vitest";

import { readWorkflowChatHistory, type WorkflowChatClient } from "../index.js";

describe("readWorkflowChatHistory", () => {
  it("accepts empty history for a new conversation", async () => {
    const client = createClient(() => Response.json({ messages: [] }));

    await expect(readWorkflowChatHistory(client)).resolves.toEqual([]);
  });

  it("rejects non-empty history that is not a valid native UI message list", async () => {
    const client = createClient(() =>
      Response.json({ messages: [{ id: "message-1", role: "user", parts: [{}] }] }),
    );

    await expect(readWorkflowChatHistory(client)).rejects.toThrow(
      "Conversation history contains invalid messages.",
    );
  });

  it("hides a non-contract HTTP response body from the public error", async () => {
    const client = createClient(() => new Response("private upstream failure", { status: 500 }));

    await expect(readWorkflowChatHistory(client)).rejects.toMatchObject({
      code: "http_error",
      message: "Chat request failed with status 500.",
      retryable: false,
    });
  });

  it("uses the stream profile safe message and retryability for recognized errors", async () => {
    const client = createClient(() =>
      Response.json(
        { code: "provider_failed", message: "private provider details", retryable: false },
        { status: 500 },
      ),
    );

    await expect(readWorkflowChatHistory(client)).rejects.toMatchObject({
      code: "provider_failed",
      message: "The model provider failed safely.",
      retryable: true,
    });
  });
});

function createClient(response: () => Response): WorkflowChatClient {
  return {
    baseUrl: "https://service.example",
    conversationId: "conversation-1",
    fetch: vi.fn<typeof fetch>(() => Promise.resolve(response())),
  };
}
