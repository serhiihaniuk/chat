import type { HostCommandResolveRequest } from "@side-chat/agent-runtime";
import { describe, expect, it } from "vitest";

import { createServiceHostCommandResolver } from "./service-host-command-resolver.js";

const request = (
  overrides: Partial<HostCommandResolveRequest> = {},
): HostCommandResolveRequest => ({
  assistantTurnId: "turn_1",
  commandId: "cmd_1",
  commandName: "open_resource",
  payload: {},
  ...overrides,
});

describe("createServiceHostCommandResolver", () => {
  it("returns no_connected_client immediately when no client is streaming the turn", async () => {
    const resolver = createServiceHostCommandResolver({
      hasConnectedClient: () => false,
      timeoutMs: 1_000,
    });

    await expect(resolver.awaitResult(request())).resolves.toMatchObject({
      status: "error",
      code: "no_connected_client",
    });
  });

  it("resolves with the browser result when a client is connected and posts a result", async () => {
    const resolver = createServiceHostCommandResolver({
      hasConnectedClient: () => true,
      timeoutMs: 1_000,
    });

    const pending = resolver.awaitResult(request());
    const settled = resolver.resolveResult({ commandId: "cmd_1", result: { opened: true } });

    expect(settled).toBe(true);
    await expect(pending).resolves.toEqual({ opened: true });
  });

  it("reports resolveResult false for an unknown or already-settled command", () => {
    const resolver = createServiceHostCommandResolver({
      hasConnectedClient: () => true,
      timeoutMs: 1_000,
    });

    expect(resolver.resolveResult({ commandId: "missing", result: {} })).toBe(false);
  });

  it("times out to a timed_out result when the browser never answers", async () => {
    const resolver = createServiceHostCommandResolver({
      hasConnectedClient: () => true,
      timeoutMs: 5,
    });

    await expect(resolver.awaitResult(request())).resolves.toMatchObject({
      status: "error",
      code: "timed_out",
    });
  });

  it("rejects when the turn's abort signal fires mid-wait", async () => {
    const resolver = createServiceHostCommandResolver({
      hasConnectedClient: () => true,
      timeoutMs: 1_000,
    });
    const controller = new AbortController();

    const pending = resolver.awaitResult(request({ abortSignal: controller.signal }));
    controller.abort();

    await expect(pending).rejects.toThrow(/aborted/iu);
  });
});
