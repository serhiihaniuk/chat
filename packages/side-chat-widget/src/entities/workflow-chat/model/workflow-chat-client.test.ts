import { describe, expect, it, vi } from "vitest";

import {
  postWorkflowApprovalDecision,
  postWorkflowClientToolOutput,
  readWorkflowActiveTurn,
  readWorkflowChatHistory,
  readWorkflowConversations,
  readWorkflowModels,
  readWorkflowTools,
  type WorkflowChatClient,
} from "../index.js";

describe("readWorkflowChatHistory", () => {
  it("accepts empty history for a new conversation", async () => {
    const client = createClient(() => Response.json({ messages: [] }));

    await expect(readWorkflowChatHistory(client)).resolves.toEqual([]);
  });

  it("accepts validated native usage metadata in history", async () => {
    const client = createClient(() =>
      Response.json({
        messages: [
          {
            id: "message-1",
            role: "assistant",
            metadata: {
              usage: {
                inputTokens: 2,
                outputTokens: 3,
                totalTokens: 5,
                reasoningTokens: 0,
                cachedInputTokens: 0,
              },
            },
            parts: [{ type: "text", text: "Answer" }],
          },
        ],
      }),
    );

    await expect(readWorkflowChatHistory(client)).resolves.toMatchObject([
      { id: "message-1", metadata: { usage: { totalTokens: 5 } } },
    ]);
  });

  it("rejects private fields in native usage metadata", async () => {
    const client = createClient(() =>
      Response.json({
        messages: [
          {
            id: "message-1",
            role: "assistant",
            metadata: {
              usage: {
                inputTokens: 2,
                outputTokens: 3,
                totalTokens: 5,
                privateField: "do-not-accept",
              },
            },
            parts: [{ type: "text", text: "Answer" }],
          },
        ],
      }),
    );

    await expect(readWorkflowChatHistory(client)).rejects.toThrow(
      "Conversation history contains invalid messages.",
    );
  });

  it("rejects non-empty history that is not a valid native UI message list", async () => {
    const client = createClient(() =>
      Response.json({
        messages: [{ id: "message-1", role: "user", parts: [{}] }],
      }),
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
        {
          code: "provider_failed",
          message: "private provider details",
          retryable: false,
        },
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

describe("readWorkflowActiveTurn", () => {
  it("returns the live run for reattach", async () => {
    const client = createClient(() =>
      Response.json({
        activeTurn: { turnId: "turn-1", runId: "run-1", status: "running" },
      }),
    );

    await expect(readWorkflowActiveTurn(client)).resolves.toEqual({
      turnId: "turn-1",
      runId: "run-1",
    });
  });

  it("returns undefined when no run is live", async () => {
    const client = createClient(() => Response.json({ activeTurn: null }));

    await expect(readWorkflowActiveTurn(client)).resolves.toBeUndefined();
  });

  it("returns undefined for a malformed active turn", async () => {
    const client = createClient(() => Response.json({ activeTurn: { runId: 5 } }));

    await expect(readWorkflowActiveTurn(client)).resolves.toBeUndefined();
  });

  it("hides a failed discovery response body from the public error", async () => {
    const client = createClient(() => new Response("private", { status: 500 }));

    await expect(readWorkflowActiveTurn(client)).rejects.toMatchObject({
      code: "http_error",
      status: 500,
    });
  });
});

describe("readWorkflowConversations", () => {
  it("maps summaries and drops malformed entries", async () => {
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
      }),
    );

    await expect(readWorkflowConversations(client)).resolves.toEqual([
      {
        id: "conversation-a",
        title: "Billing bug",
        lastMessageAt: "2026-07-13T10:00:00Z",
      },
      { id: "conversation-b", title: "", lastMessageAt: undefined },
    ]);
  });

  it("rejects a response that is not a conversation list", async () => {
    const client = createClient(() => Response.json({ conversations: "nope" }));

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

describe("readWorkflowModels", () => {
  it("maps the catalog and drops malformed models", async () => {
    const client = createClient(() =>
      Response.json({
        models: [
          {
            id: "workspace-gpt-5",
            provider: "openai",
            contextWindowTokens: 128_000,
            reasoning: {
              efforts: ["low", "medium", "high"],
              defaultEffort: "medium",
            },
          },
          {
            id: "invalid-reasoning",
            contextWindowTokens: 16_000,
            reasoning: { efforts: ["low"], defaultEffort: "xhigh" },
          },
          { provider: "no id" },
          7,
        ],
        defaultModelId: "workspace-gpt-5",
      }),
    );

    await expect(readWorkflowModels(client)).resolves.toEqual({
      models: [
        {
          id: "workspace-gpt-5",
          provider: "openai",
          contextWindowTokens: 128_000,
          reasoning: {
            efforts: ["low", "medium", "high"],
            defaultEffort: "medium",
          },
        },
      ],
      defaultModelId: "workspace-gpt-5",
    });
  });

  it("drops models without a positive integer context window", async () => {
    const client = createClient(() =>
      Response.json({
        models: [
          { id: "missing-window" },
          { id: "fractional-window", contextWindowTokens: 2.5 },
          { id: "valid", contextWindowTokens: 16_000 },
        ],
      }),
    );

    await expect(readWorkflowModels(client)).resolves.toEqual({
      models: [{ id: "valid", contextWindowTokens: 16_000 }],
      defaultModelId: undefined,
    });
  });

  it("rejects a response that is not a model catalog", async () => {
    const client = createClient(() => Response.json({ models: "nope" }));

    await expect(readWorkflowModels(client)).rejects.toThrow("Model catalog response is invalid.");
  });
});

describe("readWorkflowTools", () => {
  it("strictly validates the safe tool catalog", async () => {
    const client = createClient(() =>
      Response.json({
        tools: [
          {
            name: "mock_web_search",
            label: "Mock web search",
            description: "Search the web.",
            defaultEnabled: true,
          },
        ],
      }),
    );

    await expect(readWorkflowTools(client)).resolves.toEqual({
      tools: [
        {
          name: "mock_web_search",
          label: "Mock web search",
          description: "Search the web.",
          defaultEnabled: true,
        },
      ],
    });
  });

  it.each([
    {
      tools: [
        {
          name: "tool",
          label: "Tool",
          description: "Desc",
          defaultEnabled: true,
          secret: "x",
        },
      ],
    },
    {
      tools: [{ name: "tool", label: "", description: "Desc", defaultEnabled: true }],
    },
    {
      tools: [
        {
          name: " tool ",
          label: "Tool",
          description: "Desc",
          defaultEnabled: true,
        },
      ],
    },
    {
      tools: [{ name: "tool", label: "Tool", description: "", defaultEnabled: true }],
    },
    {
      tools: [
        {
          name: "tool",
          label: "Tool",
          description: "Desc",
          defaultEnabled: true,
        },
        {
          name: "tool",
          label: "Other",
          description: "Desc",
          defaultEnabled: false,
        },
      ],
    },
    { tools: [{ name: "tool" }] },
    { tools: "not-an-array" },
    { tools: [], privateField: "nope" },
  ])("rejects malformed or private catalog payloads: %s", async (payload) => {
    const client = createClient(() => Response.json(payload));
    await expect(readWorkflowTools(client)).rejects.toThrow("Tool catalog response is invalid.");
  });

  it("hides a failed tools response body from the public error", async () => {
    const client = createClient(() => new Response("private", { status: 500 }));
    await expect(readWorkflowTools(client)).rejects.toMatchObject({
      code: "http_error",
      status: 500,
    });
  });
});

describe("workflow interaction endpoints", () => {
  it("posts a client-tool result and retries the result-before-hook conflict", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    let attempt = 0;
    const client = createClient((input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
      });
      attempt += 1;
      return attempt === 1
        ? Promise.resolve(
            Response.json(
              {
                code: "client_tool_dispatch_not_ready",
                message: "not ready",
                retryable: true,
              },
              { status: 409, headers: { "retry-after": "0" } },
            ),
          )
        : Promise.resolve(Response.json({ accepted: true, state: "settled" }));
    });

    await expect(
      postWorkflowClientToolOutput(client, "run-1", "call-1", {
        status: "applied",
        resultCode: "opened",
      }),
    ).resolves.toBeUndefined();

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      url: "https://service.example/api/chat/run-1/tools/call-1/output",
      body: {
        output: { status: "applied", resultCode: "opened" },
      },
    });
  });

  it("posts approval decisions with an optional reason and classifies typed conflicts", async () => {
    let body: unknown;
    const client = createClient((input, init) => {
      body = JSON.parse(String(init?.body));
      return Promise.resolve(
        Response.json({
          approvalId: "approval-1",
          state: "denied",
          accepted: true,
          resumed: true,
        }),
      );
    });

    await expect(
      postWorkflowApprovalDecision(client, "run-1", "approval-1", false, "No longer needed"),
    ).resolves.toMatchObject({ state: "denied", accepted: true });
    expect(body).toEqual({ approved: false, reason: "No longer needed" });

    const conflictClient = createClient(() =>
      Promise.resolve(
        Response.json(
          {
            code: "tool_approval_conflict",
            message: "private conflict",
            retryable: false,
          },
          { status: 409 },
        ),
      ),
    );
    await expect(
      postWorkflowApprovalDecision(conflictClient, "run-1", "approval-1", true),
    ).rejects.toMatchObject({ code: "tool_approval_conflict", status: 409 });
  });
});

function createClient(
  response: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>,
): WorkflowChatClient {
  return {
    baseUrl: "https://service.example",
    conversationId: "conversation-1",
    fetch: vi.fn<typeof fetch>((input, init) => Promise.resolve(response(input, init))),
  };
}
