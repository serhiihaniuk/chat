// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  connectIframeHostContextProvider,
  registerIframeHostContextProvider,
} from "./iframe-host-context.js";
import type { HostContextSnapshot } from "./host-context.js";

const HOST_ORIGIN = "https://host.example.test";
const FRAME_ORIGIN = "https://frame.example.test";

const snapshot = (title: string): HostContextSnapshot => ({
  schemaVersion: "host-context.v1",
  title,
  collectedAt: "2026-07-14T12:00:00.000Z",
  metadata: { workspaceId: "workspace-1" },
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("iframe host-context parent registration", () => {
  it("checks exact source and origin before calling the provider", async () => {
    const frame = createFrameWindow();
    const postMessage = vi.spyOn(frame, "postMessage").mockImplementation(() => undefined);
    const getContext = vi.fn<(request: { requestId: string }) => Promise<HostContextSnapshot>>(() =>
      Promise.resolve(snapshot("Current page")),
    );
    const unregister = registerIframeHostContextProvider({
      frame,
      targetOrigin: FRAME_ORIGIN,
      getContext,
    });

    dispatchFrameMessage(frame, "https://attacker.example.test", {
      type: "sidechat.host-context.connect.v1",
      connectionId: "connection-1",
    });
    dispatchFrameMessage(frame, FRAME_ORIGIN, {
      type: "sidechat.host-context.connect.v1",
      connectionId: "connection-1",
    });
    dispatchFrameMessage(frame, FRAME_ORIGIN, {
      type: "sidechat.host-context.request.v1",
      connectionId: "connection-1",
      correlationId: "correlation-1",
      request: { requestId: "request-1" },
    });

    await vi.waitFor(() => expect(getContext).toHaveBeenCalledWith({ requestId: "request-1" }));
    expect(postMessage).toHaveBeenNthCalledWith(
      1,
      {
        type: "sidechat.host-context.available.v1",
        connectionId: "connection-1",
      },
      FRAME_ORIGIN,
    );
    expect(postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "sidechat.host-context.response.v1",
        correlationId: "correlation-1",
        ok: true,
        snapshot: snapshot("Current page"),
      }),
      FRAME_ORIGIN,
    );
    unregister();
  });

  it("returns only a safe failure when the parent provider rejects", async () => {
    const frame = createFrameWindow();
    const postMessage = vi.spyOn(frame, "postMessage").mockImplementation(() => undefined);
    const unregister = registerIframeHostContextProvider({
      frame,
      targetOrigin: FRAME_ORIGIN,
      getContext: () => Promise.reject(new Error("private host failure")),
    });
    connectParentRegistration(frame, FRAME_ORIGIN, "connection-2");

    dispatchFrameMessage(frame, FRAME_ORIGIN, {
      type: "sidechat.host-context.request.v1",
      connectionId: "connection-2",
      correlationId: "correlation-2",
      request: { requestId: "request-2" },
    });

    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
    expect(postMessage.mock.calls[1]?.[0]).toEqual({
      type: "sidechat.host-context.response.v1",
      connectionId: "connection-2",
      correlationId: "correlation-2",
      ok: false,
    });
    expect(JSON.stringify(postMessage.mock.calls)).not.toContain("private host failure");
    unregister();
  });
});

describe("iframe host-context child connection", () => {
  it("returns undefined when no parent registration answers", async () => {
    const parent = createFrameWindow();
    vi.spyOn(parent, "postMessage").mockImplementation(() => undefined);
    await withParentWindow(parent, async () => {
      await expect(
        connectIframeHostContextProvider({
          targetOrigin: HOST_ORIGIN,
          timeoutMs: 1,
        }),
      ).resolves.toBeUndefined();
    });
  });

  it("collects a fresh validated snapshot for every request", async () => {
    let collection = 0;
    const parent = createFrameWindow();
    vi.spyOn(parent, "postMessage").mockImplementation((message) => {
      if (!isMessage(message)) return;
      if (message.type === "sidechat.host-context.connect.v1") {
        dispatchParentMessage(parent, {
          type: "sidechat.host-context.available.v1",
          connectionId: message["connectionId"],
        });
        return;
      }
      if (message.type === "sidechat.host-context.request.v1") {
        collection += 1;
        dispatchParentMessage(parent, {
          type: "sidechat.host-context.response.v1",
          connectionId: message["connectionId"],
          correlationId: message["correlationId"],
          ok: true,
          snapshot: snapshot(`Page ${collection}`),
        });
      }
    });

    await withParentWindow(parent, async () => {
      const provider = await connectIframeHostContextProvider({
        targetOrigin: HOST_ORIGIN,
        timeoutMs: 50,
      });

      await expect(provider?.getContext({ requestId: "request-1" })).resolves.toMatchObject({
        title: "Page 1",
      });
      await expect(provider?.getContext({ requestId: "request-2" })).resolves.toMatchObject({
        title: "Page 2",
      });
    });
  });

  it("rejects an invalid parent snapshot without exposing its contents", async () => {
    const parent = createRespondingParent({
      schemaVersion: "host-context.v1",
      collectedAt: "not-a-timestamp",
      secret: "must-not-cross",
    });

    await withParentWindow(parent, async () => {
      const provider = await connectIframeHostContextProvider({
        targetOrigin: HOST_ORIGIN,
        timeoutMs: 50,
      });
      await expect(provider?.getContext({ requestId: "request-invalid" })).rejects.toThrow(
        "The host page returned invalid page context.",
      );
    });
  });
});

function createRespondingParent(responseSnapshot: unknown): Window {
  const parent = createFrameWindow();
  vi.spyOn(parent, "postMessage").mockImplementation((message) => {
    if (!isMessage(message)) return;
    if (message.type === "sidechat.host-context.connect.v1") {
      dispatchParentMessage(parent, {
        type: "sidechat.host-context.available.v1",
        connectionId: message["connectionId"],
      });
      return;
    }
    if (message.type === "sidechat.host-context.request.v1") {
      dispatchParentMessage(parent, {
        type: "sidechat.host-context.response.v1",
        connectionId: message["connectionId"],
        correlationId: message["correlationId"],
        ok: true,
        snapshot: responseSnapshot,
      });
    }
  });
  return parent;
}

function connectParentRegistration(frame: Window, origin: string, connectionId: string): void {
  dispatchFrameMessage(frame, origin, {
    type: "sidechat.host-context.connect.v1",
    connectionId,
  });
}

function dispatchFrameMessage(source: Window, origin: string, data: unknown): void {
  window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
}

function dispatchParentMessage(source: Window, data: unknown): void {
  queueMicrotask(() =>
    window.dispatchEvent(new MessageEvent("message", { data, origin: HOST_ORIGIN, source })),
  );
}

async function withParentWindow(parent: Window, run: () => Promise<void>): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(window, "parent");
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: parent,
  });
  try {
    await run();
  } finally {
    if (descriptor) Object.defineProperty(window, "parent", descriptor);
  }
}

function isMessage(value: unknown): value is Record<string, unknown> & { type: string } {
  return typeof value === "object" && value !== null && "type" in value;
}

function createFrameWindow(): Window {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const frame = iframe.contentWindow;
  if (!frame) throw new Error("Test iframe did not create a window.");
  return frame;
}
