import { describe, expect, it, vi } from "vitest";

import {
  postWorkflowApprovalDecision,
  postWorkflowClientToolOutput,
  readWorkflowChatHistory,
  type WorkflowChatClient,
} from "../index.js";

describe("readWorkflowChatHistory", () => {
  it("accepts empty history for a new conversation", async () => {
    const client = createClient(() => Response.json({ messages: [] }));

    await expect(readWorkflowChatHistory(client)).resolves.toEqual([]);
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
    const client = createClient(
      () => new Response("private upstream failure", { status: 500 }),
    );

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
      postWorkflowApprovalDecision(
        client,
        "run-1",
        "approval-1",
        false,
        "No longer needed",
      ),
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
  response: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Response | Promise<Response>,
): WorkflowChatClient {
  return {
    baseUrl: "https://service.example",
    conversationId: "conversation-1",
    fetch: vi.fn<typeof fetch>((input, init) =>
      Promise.resolve(response(input, init)),
    ),
  };
}
