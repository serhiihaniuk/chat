import { afterEach, describe, expect, it, vi } from "vitest";

import { withIdleSseKeepalive } from "./keepalive.js";

describe("withIdleSseKeepalive", () => {
  afterEach(() => vi.useRealTimers());
  it("emits comments only while idle and preserves source bytes", async () => {
    vi.useFakeTimers();
    let provideUpstream: (controller: ReadableStreamDefaultController<Uint8Array>) => void = () => {
      throw new Error("Upstream controller resolver was not initialized");
    };
    const upstreamAvailable = new Promise<ReadableStreamDefaultController<Uint8Array>>(
      (resolve) => (provideUpstream = resolve),
    );
    const source = new ReadableStream<Uint8Array>({
      start: (controller) => provideUpstream(controller),
    });
    const upstream = await upstreamAvailable;
    const onKeepalive = vi.fn<() => void>();
    const reader = withIdleSseKeepalive(source, 100, {
      onKeepalive,
    }).getReader();
    const idleRead = reader.read();
    await vi.advanceTimersByTimeAsync(100);
    expect(new TextDecoder().decode((await idleRead).value)).toBe(": hb\n\n");
    expect(onKeepalive).toHaveBeenCalledOnce();
    const dataRead = reader.read();
    upstream.enqueue(new TextEncoder().encode("data: one\n\n"));
    expect(new TextDecoder().decode((await dataRead).value)).toBe("data: one\n\n");
    await reader.cancel();
  });

  it("keeps the stream alive when its observer throws", async () => {
    vi.useFakeTimers();
    const source = new ReadableStream<Uint8Array>();
    const reader = withIdleSseKeepalive(source, 50, {
      onKeepalive: () => {
        throw new Error("telemetry unavailable");
      },
    }).getReader();

    const read = reader.read();
    await vi.advanceTimersByTimeAsync(50);
    expect(new TextDecoder().decode((await read).value)).toBe(": hb\n\n");
    await reader.cancel();
  });
});
