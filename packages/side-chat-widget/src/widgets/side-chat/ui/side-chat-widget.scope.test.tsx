import { describe, expect, it, vi } from "vitest";

import type { WorkflowChatClient } from "#entities/workflow-chat";
import { openTurnResponse } from "#testing/workflow-chat/workflow-widget-chat.test-support";
import { SideChatWidget } from "./side-chat-widget.js";
import { installWidgetTestDom, mountWidget, waitForWidgetDom } from "./widget-test-env.js";

installWidgetTestDom();

describe("SideChatWidget authenticated scope isolation", () => {
  it("disposes an active colliding session and renders only the next scope after rerender", async () => {
    let scopeARunSignal: AbortSignal | undefined;
    let reportScopeARunSignal: (signal: AbortSignal | undefined) => void = () => undefined;
    const scopeARunSignalReady = new Promise<AbortSignal | undefined>((resolveSignal) => {
      reportScopeARunSignal = resolveSignal;
    });
    const scopeA = createScopedClient("scope-a", "Scope A transcript", (signal) => {
      scopeARunSignal = signal;
      reportScopeARunSignal(signal);
    });
    const scopeB = createScopedClient("scope-b", "Scope B transcript");

    renderScopedWidget(scopeA);
    await waitForWidgetDom(
      () => document.body.textContent?.includes("Scope A transcript") === true,
    );
    await scopeARunSignalReady;

    renderScopedWidget(scopeB);
    await waitForWidgetDom(
      () => document.body.textContent?.includes("Scope B transcript") === true,
    );

    expect(scopeARunSignal?.aborted).toBe(true);
    expect(document.body.textContent).not.toContain("Scope A transcript");
  });
});

function renderScopedWidget(workflowChat: WorkflowChatClient): void {
  mountWidget(
    <SideChatWidget initialConversationId="conversation-collision" workflowChat={workflowChat} />,
  );
}

function createScopedClient(
  scopeKey: string,
  transcript: string,
  observeRunSignal?: (signal: AbortSignal | undefined) => void,
): WorkflowChatClient {
  const request = vi.fn<typeof fetch>((input, init) => {
    const path = new URL(requestUrl(input)).pathname;
    if (path === "/api/chat/run-a/stream") {
      observeRunSignal?.(init?.signal ?? undefined);
      return Promise.resolve(openTurnResponse(init?.signal ?? undefined));
    }
    if (path === "/api/activity") return Promise.resolve(openActivityResponse(init?.signal));
    return Promise.resolve(readScopedResponse(path, scopeKey, transcript));
  });

  return { baseUrl: "https://service.example", fetch: request, scopeKey };
}

function readScopedResponse(path: string, scopeKey: string, transcript: string): Response {
  if (path === "/api/conversations") return conversationCatalogResponse(scopeKey, transcript);
  if (path === "/api/conversations/conversation-collision/state") {
    return conversationStateResponse(scopeKey, transcript);
  }
  if (path === "/api/models") return Response.json({ models: [] });
  if (path === "/api/tools") return Response.json({ tools: [] });
  if (path === "/api/capabilities") {
    return Response.json({ hostContext: { enabled: false } });
  }
  return new Response(null, { status: 404 });
}

function conversationCatalogResponse(scopeKey: string, transcript: string): Response {
  return Response.json({
    conversations: [{ id: "conversation-collision", title: transcript }],
    runningConversationIds: scopeKey === "scope-a" ? ["conversation-collision"] : [],
  });
}

function conversationStateResponse(scopeKey: string, transcript: string): Response {
  return Response.json({
    activeTurn: scopeKey === "scope-a" ? { runId: "run-a", turnId: "turn-a" } : undefined,
    messages: [
      {
        id: `${scopeKey}-user`,
        role: "user",
        parts: [{ type: "text", text: transcript }],
      },
    ],
  });
}

function openActivityResponse(signal: AbortSignal | null | undefined): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          'event: sidechat.turn-activity-sync\ndata: {"type":"sidechat.turn-activity-sync","activeTurns":[]}\n\n',
        ),
      );
      signal?.addEventListener("abort", () => controller.close(), { once: true });
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) return input.url;
  return input instanceof URL ? input.href : input;
}
