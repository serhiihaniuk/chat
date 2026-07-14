// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import type { HostCapabilities, HostCommandActivityEvent } from "@side-chat/host-bridge";

import {
  createPostMessageHostBridge,
  HOST_COMMAND_MESSAGE_TYPE,
  HOST_COMMAND_RESULT_MESSAGE_TYPE,
  HOST_TOOL_CALL_MESSAGE_TYPE,
  HOST_TOOL_RESULT_MESSAGE_TYPE,
} from "./post-message-host-bridge.js";

const capabilities: HostCapabilities = {
  schemaVersion: "test.capabilities.v1",
  commands: [{ commandName: "open_resource", description: "Open", inputSchema: {} }],
};

const makeEvent = (commandId: string): HostCommandActivityEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.activity",
  eventId: `event-${commandId}`,
  assistantTurnId: "turn-1",
  sequence: 1,
  createdAt: "2026-06-30T00:00:00.000Z",
  activityId: commandId,
  activityKind: "host_command",
  status: "running",
  title: "Open resource",
  details: {
    hostCommand: {
      commandId,
      commandName: "open_resource",
      payload: { resourceType: "ticket", resourceId: "ticket-4821" },
    },
  },
});

const replyFromParent = (commandId: string, status: string, resultCode: string): void => {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: window.location.origin,
      data: {
        type: HOST_COMMAND_RESULT_MESSAGE_TYPE,
        commandId,
        result: { status, resultCode },
      },
    }),
  );
};

const replyFromParentForTool = (toolCallId: string, status: string, resultCode: string): void => {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: window.location.origin,
      data: {
        type: HOST_TOOL_RESULT_MESSAGE_TYPE,
        toolCallId,
        result: { status, resultCode },
      },
    }),
  );
};

describe("post-message host bridge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("forwards the command to the parent and resolves with the parent's result", async () => {
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    const bridge = createPostMessageHostBridge({});

    const pending = bridge.dispatchCommand(makeEvent("cmd-1"));

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: HOST_COMMAND_MESSAGE_TYPE,
        command: {
          commandId: "cmd-1",
          commandName: "open_resource",
          payload: { resourceType: "ticket", resourceId: "ticket-4821" },
        },
      },
      window.location.origin,
    );

    replyFromParent("cmd-1", "applied", "workbench_opened");

    await expect(pending).resolves.toMatchObject({
      commandId: "cmd-1",
      commandName: "open_resource",
      status: "applied",
      resultCode: "workbench_opened",
    });
  });

  it("ignores a reply for a different command id", async () => {
    vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    vi.useFakeTimers();
    const bridge = createPostMessageHostBridge({ timeoutMs: 1_000 });

    const pending = bridge.dispatchCommand(makeEvent("cmd-1"));
    replyFromParent("cmd-2", "applied", "wrong"); // mismatched id is ignored
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toMatchObject({
      commandId: "cmd-1",
      status: "timed_out",
      resultCode: "host_command_timeout",
    });
  });

  it("forwards native workflow tools through the same iframe boundary", async () => {
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    const bridge = createPostMessageHostBridge({});
    const pending = bridge.dispatchToolCall({
      toolCallId: "tool-1",
      toolName: "open_resource",
      input: { resourceId: "ticket-4821" },
    });

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: HOST_TOOL_CALL_MESSAGE_TYPE,
        toolCall: {
          toolCallId: "tool-1",
          toolName: "open_resource",
          input: { resourceId: "ticket-4821" },
        },
      },
      window.location.origin,
    );
    replyFromParentForTool("tool-1", "applied", "workbench_opened");
    await expect(pending).resolves.toMatchObject({
      toolCallId: "tool-1",
      toolName: "open_resource",
      status: "applied",
      resultCode: "workbench_opened",
    });
  });

  it("exposes the host catalog for native workflow request preparation", async () => {
    const bridge = createPostMessageHostBridge({ capabilities });

    await expect(bridge.getCapabilities?.()).resolves.toEqual(capabilities);
    expect(bridge).not.toHaveProperty("getContext");
  });
});
