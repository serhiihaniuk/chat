import { describe, expect, it, vi } from "vitest";

import type { WorkflowChatClient } from "#entities/workflow-chat";
import {
  SIDE_CHAT_ERROR_CODES,
  SIDE_CHAT_ERROR_VOCABULARY,
  TURN_ACTIVITY_EVENT_TYPE,
  TURN_ACTIVITY_STATUS,
  TURN_ACTIVITY_SYNC_EVENT_TYPE,
} from "@side-chat/stream-profile";
import { subscribeWorkflowActivity } from "./workflow-conversation-activity-client.js";

describe("subscribeWorkflowActivity", () => {
  it("opens the workflow activity endpoint with auth config and decodes lifecycle frames", async () => {
    let requestUrl = "";
    let requestHeaders = new Headers();
    const body = activityStream(
      {
        type: TURN_ACTIVITY_SYNC_EVENT_TYPE,
        activeTurns: [{ conversationId: "conversation-1", assistantTurnId: "turn-1" }],
      },
      {
        type: TURN_ACTIVITY_EVENT_TYPE,
        conversationId: "conversation-1",
        assistantTurnId: "turn-1",
        status: TURN_ACTIVITY_STATUS.RUNNING,
      },
      {
        type: TURN_ACTIVITY_EVENT_TYPE,
        conversationId: "conversation-1",
        assistantTurnId: "turn-1",
        status: TURN_ACTIVITY_STATUS.TERMINAL,
      },
    );
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
        type: "sidechat.turn-activity-sync",
        activeTurns: [{ conversationId: "conversation-1", assistantTurnId: "turn-1" }],
      },
      {
        type: "sidechat.turn-activity",
        conversationId: "conversation-1",
        assistantTurnId: "turn-1",
        status: "running",
      },
      {
        type: "sidechat.turn-activity",
        conversationId: "conversation-1",
        assistantTurnId: "turn-1",
        status: "terminal",
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

  it("skips event-name mismatches and malformed synchronization snapshots", async () => {
    const body = rawActivityStream(
      'event: sidechat.turn-activity-sync\ndata: {"type":"sidechat.turn-activity","conversationId":"conversation-1","assistantTurnId":"turn-1","status":"running"}\n\n' +
        'event: sidechat.turn-activity-sync\ndata: {"type":"sidechat.turn-activity-sync","activeTurns":[{"conversationId":"conversation-1"}]}\n\n',
    );
    const client = activityClient(() => Promise.resolve(new Response(body, { status: 200 })));

    const subscription = await subscribeWorkflowActivity(client);
    const events = [];
    for await (const event of subscription.events) events.push(event);

    expect(events).toEqual([]);
  });

  it("surfaces authenticated HTTP failures and missing response bodies", async () => {
    const unavailable = SIDE_CHAT_ERROR_VOCABULARY[SIDE_CHAT_ERROR_CODES.INTERNAL_ERROR];
    const failedClient = activityClient(() =>
      Promise.resolve(
        Response.json(
          {
            code: SIDE_CHAT_ERROR_CODES.INTERNAL_ERROR,
            message: unavailable.safeMessage,
            retryable: unavailable.retryable,
          },
          { status: 503 },
        ),
      ),
    );
    await expect(subscribeWorkflowActivity(failedClient)).rejects.toMatchObject({
      code: SIDE_CHAT_ERROR_CODES.INTERNAL_ERROR,
      status: 503,
    });

    const bodylessClient = activityClient(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    await expect(subscribeWorkflowActivity(bodylessClient)).rejects.toThrow(
      "Activity stream response body is missing.",
    );
  });
});

function activityClient(request: typeof fetch): WorkflowChatClient {
  return {
    baseUrl: "https://service.example",
    scopeKey: "test-scope",
    fetch: request,
  };
}

function activityStream(...events: readonly unknown[]): ReadableStream<Uint8Array> {
  return rawActivityStream(
    events
      .map((event) => `event: ${readEventType(event)}\ndata: ${JSON.stringify(event)}\n\n`)
      .join(""),
  );
}

function rawActivityStream(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

function readEventType(value: unknown): string {
  if (typeof value === "object" && value !== null && "type" in value) {
    const type = value.type;
    if (typeof type === "string") return type;
  }
  throw new TypeError("Activity fixture is missing an event type");
}
