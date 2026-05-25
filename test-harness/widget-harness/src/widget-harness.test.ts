import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import {
  createHarnessHostBridge,
  createLocalServiceClient,
  createMockEvents,
  createMockStreamClient,
  createWidgetHarnessApp,
  parseWidgetHarnessConfig,
  resolveLocalApiBaseUrl,
  withLocalAuth,
} from "./index.js";

const request = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request-1",
  message: { id: "message-1", role: "user" as const, content: "hello" },
};

describe("widget harness modes", () => {
  it("defaults to mock stream mode and mounts the blank widget reset point", () => {
    const config = parseWidgetHarnessConfig("");
    const app = createWidgetHarnessApp(config);
    const html = renderToStaticMarkup(app.element);

    expect(config).toMatchObject({
      mode: "mock-stream",
      apiBaseUrl: "/api",
      workspaceId: "local-dev",
    });
    expect(html).toBe("");
  });

  it("creates deterministic mock stream events with host command sequencing", async () => {
    const events = createMockEvents(request);
    const streamed = [];
    const client = createMockStreamClient();
    const result = await client.streamChat(request);

    for await (const event of result.events) streamed.push(event.type);

    expect(events.map((event) => event.type)).toEqual([
      "sidechat.started",
      "sidechat.reasoning",
      "sidechat.delta",
      "sidechat.host_command",
      "sidechat.completed",
    ]);
    expect(streamed).toEqual(events.map((event) => event.type));
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

    await fetchWithAuth("http://localhost:3100/chat/stream", {
      method: "POST",
      headers: { accept: "text/event-stream" },
    });

    expect(seenHeaders).toEqual([
      { accept: "text/event-stream", authorization: "Bearer local-test-token" },
    ]);

    expect(
      createLocalServiceClient(
        parseWidgetHarnessConfig(
          "?mode=local-service&apiBaseUrl=http://localhost:3100",
        ),
      ),
    ).toHaveProperty("streamChat");
    expect(
      resolveLocalApiBaseUrl(
        parseWidgetHarnessConfig("?mode=local-service").apiBaseUrl,
      ),
    ).toBe("http://127.0.0.1:5173/api");
    expect(resolveLocalApiBaseUrl("http://localhost:3100")).toBe(
      "http://localhost:3100",
    );
    expect(seenInputs).toContain("http://localhost:3100/chat/stream");
    expect(seenInputs).not.toContain("/api/chat/stream");
  });

  it("keeps host command results as harness-local records", async () => {
    const bridge = createHarnessHostBridge(
      parseWidgetHarnessConfig("?mode=mock-stream"),
    );
    const result = await bridge.dispatchCommand({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      type: "sidechat.host_command",
      eventId: "event-command",
      assistantTurnId: "turn-1",
      sequence: 1,
      createdAt: "2026-05-23T14:00:00.000Z",
      commandId: "command-1",
      commandName: "open_resource",
      payload: { resourceType: "document", resourceId: "doc-1" },
    });

    expect(result).toMatchObject({
      status: "applied",
      resultCode: "harness_local_only",
      data: { persisted: false },
    });
    expect(bridge.commandRecords).toHaveLength(1);
  });
});
