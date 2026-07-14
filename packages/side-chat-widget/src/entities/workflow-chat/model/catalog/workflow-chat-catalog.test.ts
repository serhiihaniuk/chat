import { describe, expect, it, vi } from "vitest";

import { readWorkflowConversations, type WorkflowChatClient } from "../../index.js";

describe("readWorkflowConversations", () => {
  it("maps summaries and keeps only listed running conversation ids", async () => {
    const client = createClient(() =>
      Response.json({
        conversations: [
          {
            id: "conversation-a",
            title: "Billing bug",
            lastMessageAt: "2026-07-13T10:00:00Z",
          },
          { id: "conversation-b" },
          { title: "no id" },
          42,
        ],
        runningConversationIds: ["conversation-a", "conversation-a", "missing", 42],
      }),
    );

    await expect(readWorkflowConversations(client)).resolves.toEqual({
      conversations: [
        {
          id: "conversation-a",
          title: "Billing bug",
          lastMessageAt: "2026-07-13T10:00:00Z",
        },
        { id: "conversation-b", title: "", lastMessageAt: undefined },
      ],
      runningConversationIds: new Set(["conversation-a"]),
    });
  });

  it("rejects a response that is not a conversation list", async () => {
    const client = createClient(() =>
      Response.json({ conversations: "nope", runningConversationIds: [] }),
    );

    await expect(readWorkflowConversations(client)).rejects.toThrow(
      "Conversation list response is invalid.",
    );
  });

  it("rejects a malformed running-conversation list", async () => {
    const client = createClient(() =>
      Response.json({ conversations: [], runningConversationIds: "conversation-a" }),
    );

    await expect(readWorkflowConversations(client)).rejects.toThrow(
      "Conversation list response is invalid.",
    );
  });

  it("hides a failed list response body from the public error", async () => {
    const client = createClient(() => new Response("private", { status: 500 }));

    await expect(readWorkflowConversations(client)).rejects.toMatchObject({
      code: "http_error",
      status: 500,
    });
  });
});

function createClient(
  response: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>,
): WorkflowChatClient {
  return {
    baseUrl: "https://service.example",
    fetch: vi.fn<typeof fetch>((input, init) => Promise.resolve(response(input, init))),
  };
}
