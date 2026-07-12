import { describe, expect, it, vi } from "vitest";

import type {
  HostCapabilities,
  WidgetHostBridge,
} from "@side-chat/host-bridge";

import type { WorkflowChatClient } from "#entities/workflow-chat";

import { dispatchWorkflowClientTool } from "./workflow-client-tool-dispatch.js";

const capabilities: HostCapabilities = {
  schemaVersion: "test.capabilities.v1",
  commands: [
    {
      commandName: "open_resource",
      description: "Open a host resource.",
      inputSchema: { type: "object" },
    },
  ],
};

describe("dispatchWorkflowClientTool", () => {
  it("dispatches a dynamic tool through the bridge and posts its success", async () => {
    const dispatch = vi.fn<NonNullable<WidgetHostBridge["dispatchToolCall"]>>(
      async (toolCall) => ({
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        status: "applied" as const,
        resultCode: "opened",
        resolvedAt: "2026-07-12T00:00:00.000Z",
        data: { persisted: false },
      }),
    );
    const bridge = createBridge({ dispatchToolCall: dispatch });
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ accepted: true })),
    );
    const outcome = await dispatchWorkflowClientTool({
      client: createClient(request),
      hostBridge: bridge,
      runId: "run-1",
      toolCall: {
        dynamic: true,
        toolCallId: "call-1",
        toolName: "open_resource",
        input: { resourceId: "doc-1" },
      },
    });

    expect(dispatch).toHaveBeenCalledWith({
      toolCallId: "call-1",
      toolName: "open_resource",
      input: { resourceId: "doc-1" },
    });
    expect(outcome).toMatchObject({
      outputPosted: true,
      result: { status: "applied" },
    });
    expect(request.mock.calls[0]?.[0]).toBe(
      "https://service.example/api/chat/run-1/tools/call-1/output",
    );
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({
      output: { status: "applied", resultCode: "opened" },
    });
  });

  it("posts an unsupported result without invoking a missing capability", async () => {
    const dispatch = vi.fn<NonNullable<WidgetHostBridge["dispatchToolCall"]>>();
    const bridge = createBridge({
      capabilities: { schemaVersion: "test.capabilities.v1", commands: [] },
      dispatchToolCall: dispatch,
    });
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ accepted: true })),
    );
    const outcome = await dispatchWorkflowClientTool({
      client: createClient(request),
      hostBridge: bridge,
      runId: "run-1",
      toolCall: {
        dynamic: true,
        toolCallId: "call-2",
        toolName: "missing",
        input: {},
      },
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      outputPosted: true,
      result: { status: "unsupported", resultCode: "unsupported_command" },
    });
  });

  it("turns a throwing dispatcher into a posted failed result", async () => {
    const bridge = createBridge({
      dispatchToolCall: vi.fn<
        NonNullable<WidgetHostBridge["dispatchToolCall"]>
      >(async () => {
        throw new Error("private host failure");
      }),
    });
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ accepted: true })),
    );

    await expect(
      dispatchWorkflowClientTool({
        client: createClient(request),
        hostBridge: bridge,
        runId: "run-1",
        toolCall: {
          dynamic: true,
          toolCallId: "call-3",
          toolName: "open_resource",
          input: {},
        },
      }),
    ).resolves.toMatchObject({
      outputPosted: true,
      result: { status: "failed" },
    });
  });

  it("posts a calm failed result when no bridge is configured", async () => {
    const request = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ accepted: true })),
    );

    await expect(
      dispatchWorkflowClientTool({
        client: createClient(request),
        hostBridge: undefined,
        runId: "run-1",
        toolCall: {
          dynamic: true,
          toolCallId: "call-4",
          toolName: "open_resource",
          input: {},
        },
      }),
    ).resolves.toMatchObject({
      outputPosted: true,
      result: { status: "failed", resultCode: "host_bridge_unavailable" },
    });
  });
});

function createBridge({
  capabilities: currentCapabilities = capabilities,
  dispatchToolCall,
}: {
  readonly capabilities?: HostCapabilities;
  readonly dispatchToolCall: NonNullable<WidgetHostBridge["dispatchToolCall"]>;
}): WidgetHostBridge {
  return {
    getContext: () =>
      Promise.resolve({
        schemaVersion: "test",
        origin: "https://test.example",
      }),
    getCapabilities: () => Promise.resolve(currentCapabilities),
    dispatchCommand: () => Promise.reject(new Error("legacy path is not used")),
    dispatchToolCall,
  };
}

function createClient(fetch: typeof globalThis.fetch): WorkflowChatClient {
  return {
    baseUrl: "https://service.example",
    conversationId: "conversation-1",
    fetch,
  };
}
