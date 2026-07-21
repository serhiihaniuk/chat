import { describe, expect, it, vi } from "vitest";

import type { WorkflowChatClient } from "#entities/workflow-chat";
import { subscribeWorkflowActivity } from "./workflow-conversation-activity-client.js";

describe("subscribeWorkflowActivity", () => {
  it("opens the workflow activity endpoint with auth config and decodes lifecycle frames", async () => {
    let requestUrl = "";
    let requestHeaders = new Headers();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: sidechat.turn-activity\ndata: {"type":"sidechat.turn-activity","conversationId":"conversation-1","assistantTurnId":"turn-1","status":"running"}\n\n',
          ),
        );
        controller.close();
      },
    });
    const client: WorkflowChatClient = {
      baseUrl: "https://service.example",
      scopeKey: "test-scope",
      getRequestConfig: () => ({ headers: { authorization: "Bearer test-token" } }),
      fetch: vi.fn<typeof fetch>((input, init) => {
        requestUrl = String(input);
        requestHeaders = new Headers(init?.headers);
        return Promise.resolve(new Response(body, { status: 200 }));
      }),
    };

    const subscription = await subscribeWorkflowActivity(client);
    const events = [];
    for await (const event of subscription.events) events.push(event);

    expect(requestUrl).toBe("https://service.example/api/activity");
    expect(requestHeaders.get("authorization")).toBe("Bearer test-token");
    expect(requestHeaders.get("accept")).toBe("text/event-stream");
    expect(events).toEqual([
      {
        type: "sidechat.turn-activity",
        conversationId: "conversation-1",
        assistantTurnId: "turn-1",
        status: "running",
      },
    ]);
  });

  it("discards an unknown transition status at the browser boundary", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'event: sidechat.turn-activity\ndata: {"type":"sidechat.turn-activity","conversationId":"conversation-1","assistantTurnId":"turn-1","status":"completed"}\n\n',
          ),
        );
        controller.close();
      },
    });
    const client: WorkflowChatClient = {
      baseUrl: "https://service.example",
      scopeKey: "test-scope",
      fetch: () => Promise.resolve(new Response(body, { status: 200 })),
    };
    const subscription = await subscribeWorkflowActivity(client);
    const events = [];
    for await (const event of subscription.events) events.push(event);

    expect(events).toEqual([]);
  });
});
