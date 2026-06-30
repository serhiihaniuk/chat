import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";

import { createHostBridge } from "./bridge.js";
import {
  supportsCommand,
  toHostCommand,
  type HostCapabilities,
  type HostCommandActivityEvent,
} from "#commands/capability";
import {
  createCommandResult,
  createRejectedResult,
  createUnsupportedResult,
} from "#commands/command-result";
import { dispatchSupportedCommand } from "#commands/command-dispatcher";
import {
  createStaticHostContextProvider,
  toProtocolHostContext,
  type HostContextSnapshot,
} from "#context/host-context";

const capabilities: HostCapabilities = {
  schemaVersion: "host-bridge.capabilities.v1",
  commands: [
    {
      commandName: "open_resource",
      description: "Open a host resource.",
      inputSchema: { type: "object" },
      resourceTypes: ["document"],
    },
    { commandName: "highlight_source", description: "Highlight a source.", inputSchema: { type: "object" } },
  ],
};

const commandEvent = (
  payload = { resourceType: "document", resourceId: "doc-1" },
): HostCommandActivityEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.activity",
  eventId: "evt-command-1",
  assistantTurnId: "turn-1",
  sequence: 2,
  createdAt: "2026-05-23T00:00:02.000Z",
  activityId: "command-1",
  activityKind: "host_command",
  status: "running",
  title: "Open resource",
  details: {
    hostCommand: {
      commandId: "command-1",
      commandName: "open_resource",
      payload,
    },
  },
});

const contextSnapshot: HostContextSnapshot = {
  schemaVersion: "host-context.v1",
  origin: "https://host.example.test",
  url: "https://host.example.test/docs/doc-1",
  title: "Document",
  collectedAt: "2026-05-23T00:00:00.000Z",
  expiresAt: "2026-05-23T00:01:00.000Z",
  capabilityHash: "capability-hash-1",
  surface: {
    surfaceId: "docs-panel",
    resourceType: "document",
    resourceId: "doc-1",
  },
};

describe("host bridge capabilities", () => {
  it("matches supported commands by name and resource type", () => {
    expect(supportsCommand(capabilities, toHostCommand(commandEvent()))).toBe(true);
    expect(
      supportsCommand(
        capabilities,
        toHostCommand(commandEvent({ resourceType: "ticket", resourceId: "t-1" })),
      ),
    ).toBe(false);
  });

  it("returns unsupported results before dispatching unsupported commands", async () => {
    const unsupported = toHostCommand(commandEvent({ resourceType: "ticket", resourceId: "t-1" }));
    let dispatched = false;

    const result = await dispatchSupportedCommand(
      {
        dispatchCommand: () => {
          dispatched = true;
          return Promise.resolve(
            createCommandResult(unsupported, {
              status: "applied",
              resultCode: "ok",
            }),
          );
        },
      },
      capabilities,
      unsupported,
    );

    expect(dispatched).toBe(false);
    expect(result).toMatchObject({
      commandId: "command-1",
      status: "unsupported",
      resultCode: "unsupported_command",
    });
  });

  it("models local command results without a durable backend route", () => {
    const command = toHostCommand(commandEvent());

    expect(createUnsupportedResult(command)).toMatchObject({
      status: "unsupported",
      commandId: "command-1",
    });
    expect(createRejectedResult(command, "host_policy_denied")).toMatchObject({
      status: "rejected",
      resultCode: "host_policy_denied",
    });
  });
});

describe("host context bridge", () => {
  it("converts host context snapshots into protocol-safe context", () => {
    const protocolContext = toProtocolHostContext(contextSnapshot);

    expect(protocolContext).toMatchObject({
      schemaVersion: "host-context.v1",
      origin: "https://host.example.test",
      metadata: {
        collectedAt: "2026-05-23T00:00:00.000Z",
        expiresAt: "2026-05-23T00:01:00.000Z",
        capabilityHash: "capability-hash-1",
        surface: {
          surfaceId: "docs-panel",
          resourceType: "document",
          resourceId: "doc-1",
        },
      },
    });
  });

  it("collects context and dispatches commands through the public bridge", async () => {
    const command = toHostCommand(commandEvent());
    const bridge = createHostBridge({
      contextProvider: createStaticHostContextProvider(contextSnapshot, capabilities),
      capabilities,
      dispatcher: {
        dispatchCommand: () =>
          Promise.resolve(
            createCommandResult(command, {
              status: "applied",
              resultCode: "opened",
              data: { selected: true },
            }),
          ),
      },
    });

    const [context, result] = await Promise.all([
      bridge.getContext({ requestId: "request-1" }),
      bridge.dispatchCommand(commandEvent()),
    ]);

    expect(context.metadata?.["collectedAt"]).toBe("2026-05-23T00:00:00.000Z");
    expect(result).toMatchObject({
      status: "applied",
      resultCode: "opened",
      data: { selected: true },
    });
  });
});
