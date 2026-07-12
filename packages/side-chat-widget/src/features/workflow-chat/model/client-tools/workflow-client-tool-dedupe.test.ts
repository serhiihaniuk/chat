import { describe, expect, it, vi } from "vitest";
import type { ChatOnToolCallCallback } from "ai";

import type {
  HostCapabilities,
  HostToolCall,
  HostToolResult,
  WidgetHostBridge,
} from "@side-chat/host-bridge";

import type {
  WorkflowChatClient,
  WorkflowUIMessage,
} from "#entities/workflow-chat";

import { createWorkflowClientToolCallHandler } from "./workflow-client-tool-callback.js";

const capabilities: HostCapabilities = {
  schemaVersion: "test.capabilities.v1",
  commands: [
    { commandName: "open_resource", description: "Open", inputSchema: {} },
  ],
};

describe("native workflow client-tool callback", () => {
  it("dispatches an unsettled call once across concurrent rerenders", async () => {
    let releaseDispatch: (() => void) | undefined;
    const dispatch = vi.fn<NonNullable<WidgetHostBridge["dispatchToolCall"]>>(
      () =>
        new Promise<HostToolResult>((resolve) => {
          releaseDispatch = () =>
            resolve({
              toolCallId: "call-1",
              toolName: "open_resource",
              status: "applied",
              resultCode: "opened",
              resolvedAt: "2026-07-12T00:00:00.000Z",
            });
        }),
    );
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ accepted: true })),
    );
    const refs = createRefs(createBridge(dispatch), request, []);
    const handler = createWorkflowClientToolCallHandler(refs);
    const call = makeToolCall();

    const first = handler({ toolCall: call });
    const second = handler({ toolCall: call });
    await Promise.resolve();
    expect(dispatch).toHaveBeenCalledTimes(1);

    releaseDispatch?.();
    await Promise.all([first, second]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch settled replay parts, but dispatches a fresh unsettled reload once", async () => {
    const dispatch = vi.fn<NonNullable<WidgetHostBridge["dispatchToolCall"]>>(
      async (toolCall: HostToolCall): Promise<HostToolResult> => ({
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        status: "applied" as const,
        resultCode: "ok",
        resolvedAt: "2026-07-12T00:00:00.000Z",
      }),
    );
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ accepted: true })),
    );
    const settled = createRefs(createBridge(dispatch), request, [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "call-1",
            toolName: "open_resource",
            state: "output-available",
            input: {},
            output: { status: "applied" },
          },
        ],
      },
    ]);
    const settledHandler = createWorkflowClientToolCallHandler(settled);
    await settledHandler({ toolCall: makeToolCall() });
    expect(dispatch).not.toHaveBeenCalled();

    const fresh = createRefs(createBridge(dispatch), request, [
      {
        id: "assistant-2",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "call-1",
            toolName: "open_resource",
            state: "input-available",
            input: {},
          },
        ],
      },
    ]);
    const freshHandler = createWorkflowClientToolCallHandler(fresh);
    await freshHandler({ toolCall: makeToolCall() });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("ignores static tool callbacks and keeps approval state local to the branch", () => {
    const dispatch = vi.fn<NonNullable<WidgetHostBridge["dispatchToolCall"]>>();
    const refs = createRefs(createBridge(dispatch), vi.fn<typeof fetch>(), []);
    const handler = createWorkflowClientToolCallHandler(refs);
    const staticCall = {
      toolCallId: "static-1",
      toolName: "open_resource",
      input: {},
      dynamic: false,
    } satisfies Parameters<
      ChatOnToolCallCallback<WorkflowUIMessage>
    >[0]["toolCall"];

    void handler({ toolCall: staticCall });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

function createRefs(
  bridge: WidgetHostBridge,
  fetch: typeof globalThis.fetch,
  messages: readonly WorkflowUIMessage[],
) {
  return {
    activeRunIdRef: { current: "run-1" },
    clientRef: {
      current: {
        baseUrl: "https://service.example",
        conversationId: "conversation-1",
        fetch,
      } satisfies WorkflowChatClient,
    },
    dispatchedToolCallIdsRef: { current: new Set<string>() },
    hostBridgeRef: { current: bridge },
    latestMessagesRef: { current: messages },
  };
}

function createBridge(
  dispatch: NonNullable<WidgetHostBridge["dispatchToolCall"]>,
): WidgetHostBridge {
  return {
    getContext: () =>
      Promise.resolve({
        schemaVersion: "test",
        origin: "https://test.example",
      }),
    getCapabilities: () => Promise.resolve(capabilities),
    dispatchCommand: () => Promise.reject(new Error("legacy path is not used")),
    dispatchToolCall: dispatch,
  };
}

function makeToolCall(): Parameters<
  ChatOnToolCallCallback<WorkflowUIMessage>
>[0]["toolCall"] {
  return {
    toolCallId: "call-1",
    toolName: "open_resource",
    input: { resourceId: "doc-1" },
    dynamic: true,
  };
}
