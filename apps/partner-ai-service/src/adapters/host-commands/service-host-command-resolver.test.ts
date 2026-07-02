import type { HostCommandResolveRequest } from "@side-chat/agent-runtime";
import { createMemorySidechatRepositories } from "@side-chat/db";
import { describe, expect, it } from "vitest";

import {
  createServiceHostCommandResolver,
  type ServiceHostCommandResolverInput,
} from "./service-host-command-resolver.js";

const WORKSPACE_ID = "workspace_hc";

const request = (
  overrides: Partial<HostCommandResolveRequest> = {},
): HostCommandResolveRequest => ({
  assistantTurnId: "turn_1",
  commandId: "cmd_1",
  commandName: "open_resource",
  payload: {},
  ...overrides,
});

const resolverInput = (
  overrides: Partial<ServiceHostCommandResolverInput> = {},
): ServiceHostCommandResolverInput => ({
  hasConnectedClient: () => true,
  timeoutMs: 1_000,
  repositories: createMemorySidechatRepositories(),
  workspaceId: WORKSPACE_ID,
  clock: { now: () => "2026-07-02T00:00:00.000Z" },
  resultPollIntervalMs: 5,
  ...overrides,
});

describe("createServiceHostCommandResolver", () => {
  it("returns no_connected_client immediately when no client is streaming the turn", async () => {
    const resolver = createServiceHostCommandResolver(
      resolverInput({ hasConnectedClient: () => false }),
    );

    await expect(resolver.awaitResult(request())).resolves.toMatchObject({
      status: "error",
      code: "no_connected_client",
    });
  });

  it("resolves with the browser result when a client is connected and posts a result", async () => {
    const resolver = createServiceHostCommandResolver(resolverInput());

    const pending = resolver.awaitResult(request());
    await settleNextTick();
    const settled = resolver.resolveResult({
      assistantTurnId: "turn_1",
      commandId: "cmd_1",
      result: { opened: true },
    });

    expect(settled).toBe(true);
    await expect(pending).resolves.toEqual({ opened: true });
  });

  it("persists the emitted row that binds the command to its turn", async () => {
    const repositories = createMemorySidechatRepositories();
    const resolver = createServiceHostCommandResolver(resolverInput({ repositories }));

    const pending = resolver.awaitResult(request({ payload: { target: "ticket-1" } }));
    await settleNextTick();

    await expect(
      repositories.findHostCommandResult({
        workspaceId: WORKSPACE_ID,
        assistantTurnId: "turn_1",
        commandId: "cmd_1",
      }),
    ).resolves.toMatchObject({
      status: "emitted",
      commandType: "open_resource",
      commandRedactedJson: { target: "ticket-1" },
    });

    resolver.resolveResult({ assistantTurnId: "turn_1", commandId: "cmd_1", result: {} });
    await pending;
  });

  it("never settles a command through a different turn", async () => {
    const resolver = createServiceHostCommandResolver(resolverInput({ timeoutMs: 30 }));

    const pending = resolver.awaitResult(request());
    const settled = resolver.resolveResult({
      assistantTurnId: "turn_other",
      commandId: "cmd_1",
      result: { forged: true },
    });

    expect(settled).toBe(false);
    // The pending command is untouched and times out honestly.
    await expect(pending).resolves.toMatchObject({ status: "error", code: "timed_out" });
  });

  it("settles from the persisted result when the POST landed on another instance", async () => {
    // Two resolvers over one store model two service instances sharing a
    // database (the memory profile has no NOTIFY, so this exercises the owner's
    // result poll — the missed-signal backstop).
    const repositories = createMemorySidechatRepositories();
    const owner = createServiceHostCommandResolver(resolverInput({ repositories }));
    const pending = owner.awaitResult(request());
    await settleNextTick();

    // The other instance's route persists the browser's result durably.
    await repositories.recordHostCommandResult({
      workspaceId: WORKSPACE_ID,
      assistantTurnId: "turn_1",
      commandId: "cmd_1",
      commandType: "open_resource",
      status: "applied",
      resultCode: "harness_local_only",
      commandRedactedJson: {},
      resultRedactedJson: { opened: true, via: "other-instance" },
      resolvedAt: "2026-07-02T00:00:01.000Z",
      now: "2026-07-02T00:00:01.000Z",
    });

    await expect(pending).resolves.toEqual({ opened: true, via: "other-instance" });
  });

  it("times out to a timed_out result when the browser never answers", async () => {
    const resolver = createServiceHostCommandResolver(resolverInput({ timeoutMs: 5 }));

    await expect(resolver.awaitResult(request())).resolves.toMatchObject({
      status: "error",
      code: "timed_out",
    });
  });

  it("rejects when the turn's abort signal fires mid-wait", async () => {
    const resolver = createServiceHostCommandResolver(resolverInput());
    const controller = new AbortController();

    const pending = resolver.awaitResult(request({ abortSignal: controller.signal }));
    await settleNextTick();
    controller.abort();

    await expect(pending).rejects.toThrow(/aborted/iu);
  });
});

/** Let awaitResult's durable emit write settle before interacting with the pending map. */
const settleNextTick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
