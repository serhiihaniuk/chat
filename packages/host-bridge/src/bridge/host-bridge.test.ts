import { describe, expect, it, vi } from "vitest";

import {
  createHostBridge,
  createStaticHostContextProvider,
  type HostCapabilities,
  type HostContextSnapshot,
  type HostToolCall,
} from "../index.js";

const capabilities: HostCapabilities = {
  schemaVersion: "host-bridge.capabilities.v1",
  tools: [
    {
      toolName: "open_resource",
      description: "Open a host resource.",
      inputSchema: { type: "object" },
      resourceTypes: ["document"],
    },
  ],
};

const contextSnapshot: HostContextSnapshot = {
  schemaVersion: "host-context.v1",
  origin: "https://host.example.test",
  title: "Document",
  collectedAt: "2026-07-16T00:00:00.000Z",
  surface: {
    surfaceId: "docs-panel",
    resourceType: "document",
    resourceId: "doc-1",
  },
};

const toolCall = (resourceType: string): HostToolCall => ({
  toolCallId: "tool-call-1",
  toolName: "open_resource",
  input: { resourceType, resourceId: "doc-1" },
});

describe("createHostBridge", () => {
  it("exposes host context independently from client tools", async () => {
    const bridge = createHostBridge({
      contextProvider: createStaticHostContextProvider(contextSnapshot),
    });

    await expect(bridge.getContext?.({ requestId: "request-1" })).resolves.toMatchObject({
      title: "Document",
      metadata: {
        collectedAt: "2026-07-16T00:00:00.000Z",
        surface: { resourceId: "doc-1" },
      },
    });
    expect(bridge.getCapabilities).toBeUndefined();
    expect(bridge.dispatchToolCall).toBeUndefined();
  });

  it("dispatches only client tools supported by the current capabilities", async () => {
    const dispatchToolCall = vi.fn(async (call: HostToolCall) => ({
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      status: "applied" as const,
      resultCode: "opened",
      resolvedAt: "2026-07-16T00:00:01.000Z",
    }));
    let currentCapabilities: HostCapabilities = { ...capabilities, tools: [] };
    const bridge = createHostBridge({
      capabilityProvider: {
        getCapabilities: () => Promise.resolve(currentCapabilities),
      },
      toolDispatcher: { dispatchToolCall },
    });

    await expect(bridge.dispatchToolCall?.(toolCall("document"))).resolves.toMatchObject({
      status: "unsupported",
      resultCode: "unsupported_tool",
    });
    expect(dispatchToolCall).not.toHaveBeenCalled();

    currentCapabilities = capabilities;
    await expect(bridge.dispatchToolCall?.(toolCall("document"))).resolves.toMatchObject({
      status: "applied",
      resultCode: "opened",
    });
    expect(dispatchToolCall).toHaveBeenCalledOnce();
  });

  it("rejects a supported tool name when its resource type is unsupported", async () => {
    const dispatchToolCall = vi.fn();
    const bridge = createHostBridge({
      capabilities,
      toolDispatcher: { dispatchToolCall },
    });

    await expect(bridge.dispatchToolCall?.(toolCall("ticket"))).resolves.toMatchObject({
      status: "unsupported",
      resultCode: "unsupported_tool",
    });
    expect(dispatchToolCall).not.toHaveBeenCalled();
  });
});
