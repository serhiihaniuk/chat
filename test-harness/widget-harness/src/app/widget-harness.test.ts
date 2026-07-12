import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import {
  createHarnessHostBridge,
  createLocalServiceClient,
  createWorkflowServiceClient,
  createMockEvents,
  createMockStreamClient,
  createWidgetHarnessApp,
  parseWidgetHarnessConfig,
  resolveLocalApiBaseUrl,
  withLocalAuth,
} from "../index.js";

const request = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request-1",
  message: { id: "message-1", content: "hello" },
};

describe("widget harness modes", () => {
  it("defaults to local service mode and mounts the widget shell", () => {
    const config = parseWidgetHarnessConfig("");
    const app = createWidgetHarnessApp(config);
    const html = renderToStaticMarkup(app.element);

    expect(config).toMatchObject({
      mode: "local-service",
      apiBaseUrl: "/side-chat-api",
      authToken: "local-compose-token",
      conversationId: "conversation-1",
      defaultOpen: true,
      openControl: "widget",
      workspaceId: "workspace_local",
    });
    expect(html).toContain("Workspace Assistant");
    expect(html).toContain("How can I help with this page?");
  });

  it("configures host-controlled iframe open state from query params", () => {
    const config = parseWidgetHarnessConfig("?openControl=host&open=false");
    const app = createWidgetHarnessApp(config);
    const html = renderToStaticMarkup(app.element);

    expect(config).toMatchObject({
      defaultOpen: false,
      openControl: "host",
    });
    expect(html).not.toContain("Workspace Assistant");
  });

  it("creates deterministic mock stream events on the connection-bound call", async () => {
    const events = createMockEvents(request);
    const streamed = [];
    const client = createMockStreamClient();
    const run = await client.createRun(request);

    // The create response IS the stream, identity frame first.
    for await (const event of run.events) streamed.push(event.type);

    expect(run).toMatchObject({
      requestId: "request-1",
      assistantTurnId: "turn-request-1",
    });
    expect(events.map((event) => event.type)).toEqual([
      "sidechat.started",
      "sidechat.activity",
      "sidechat.delta",
      "sidechat.activity",
      "sidechat.completed",
    ]);
    expect(streamed).toEqual(events.map((event) => event.type));
  });

  it("replays only events after the reconnect offset", async () => {
    const client = createMockStreamClient();
    const run = await client.createRun(request);
    const subscription = await client.subscribeTurn(run.assistantTurnId, {
      after: 1,
    });

    const sequences = [];
    for await (const event of subscription.events)
      sequences.push(event.sequence);

    // Default script is started(0), reasoning(1), delta(2), host-command(3), completed(4).
    expect(sequences).toEqual([2, 3, 4]);
  });

  it("configures local service mode with auth-wrapped fetch", async () => {
    const seenHeaders: HeadersInit[] = [];
    const seenInputs: Array<string | URL | Request> = [];
    const fetchLike = (
      input: string | URL | Request,
      init: RequestInit = {},
    ) => {
      seenInputs.push(input);
      seenHeaders.push(init.headers ?? {});
      return Promise.resolve(new Response("busy", { status: 503 }));
    };
    const fetchWithAuth = withLocalAuth("local-test-token", fetchLike);

    await fetchWithAuth("http://localhost:3100/chat/runs", {
      method: "POST",
      headers: { accept: "application/json" },
    });

    expect(seenHeaders).toEqual([
      { accept: "application/json", authorization: "Bearer local-test-token" },
    ]);

    expect(
      createLocalServiceClient(
        parseWidgetHarnessConfig(
          "?mode=local-service&apiBaseUrl=http://localhost:3100",
        ),
      ),
    ).toHaveProperty("createRun");
    expect(
      resolveLocalApiBaseUrl(
        parseWidgetHarnessConfig("?mode=local-service").apiBaseUrl,
      ),
    ).toBe("http://127.0.0.1:5173/side-chat-api");
    expect(resolveLocalApiBaseUrl("http://localhost:3100")).toBe(
      "http://localhost:3100",
    );
    expect(seenInputs).toContain("http://localhost:3100/chat/runs");
    expect(seenInputs).not.toContain("/api/chat/runs");
  });

  it("configures the isolated workflow-service widget path", () => {
    const config = parseWidgetHarnessConfig(
      "?mode=workflow-service&authToken=fresh-token&conversationId=conversation-42",
    );
    const app = createWidgetHarnessApp(config);
    const client = createWorkflowServiceClient(config);

    expect(config.mode).toBe("workflow-service");
    expect(client).toMatchObject({
      baseUrl: "http://127.0.0.1:5173/side-chat-api",
      conversationId: "conversation-42",
    });
    expect(client.getRequestConfig?.()).toEqual({
      headers: { authorization: "Bearer fresh-token" },
    });
    expect(renderToStaticMarkup(app.element)).toContain("Workspace Assistant");
  });

  it("keeps the workflow-service launcher available in standalone closed state", () => {
    const config = parseWidgetHarnessConfig(
      "?mode=workflow-service&open=false",
    );
    const html = renderToStaticMarkup(createWidgetHarnessApp(config).element);

    expect(html).toContain("Workspace Assistant");
  });

  it("keeps host command results as harness-local records", async () => {
    const bridge = createHarnessHostBridge(
      parseWidgetHarnessConfig("?mode=mock-stream"),
    );
    const result = await bridge.dispatchCommand({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      type: "sidechat.activity",
      eventId: "event-command",
      assistantTurnId: "turn-1",
      sequence: 1,
      createdAt: "2026-05-23T14:00:00.000Z",
      activityId: "command-1",
      activityKind: "host_command",
      status: "running",
      title: "Open resource",
      details: {
        hostCommand: {
          commandId: "command-1",
          commandName: "open_resource",
          payload: { resourceType: "document", resourceId: "doc-1" },
        },
      },
    });

    expect(result).toMatchObject({
      status: "applied",
      resultCode: "harness_local_only",
      data: { persisted: false },
    });
    expect(bridge.commandRecords).toHaveLength(1);
  });

  it("keeps native workflow tool results as harness-local records", async () => {
    const bridge = createHarnessHostBridge(
      parseWidgetHarnessConfig("?mode=workflow-service"),
    );
    const result = await bridge.dispatchToolCall({
      toolCallId: "tool-call-1",
      toolName: "open_resource",
      input: { resourceId: "doc-1" },
    });

    expect(result).toMatchObject({
      toolCallId: "tool-call-1",
      status: "applied",
      resultCode: "harness_local_only",
    });
    expect(bridge.toolRecords).toHaveLength(1);
  });
});
