const KEEPALIVE_FRAME = new TextEncoder().encode(": hb\n\n");

export type KeepaliveObserver = Readonly<{
  onKeepalive?: () => void;
}>;

/** Add an SSE comment only when the upstream byte stream has been idle for one interval. */
export function withIdleSseKeepalive(
  source: ReadableStream<Uint8Array>,
  intervalMs: number,
  observer: KeepaliveObserver = {},
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let pendingRead: Promise<ReadableStreamReadResult<Uint8Array>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      pendingRead ??= reader.read();
      const idle = new Promise<"idle">((resolve) => {
        timer = setTimeout(() => resolve("idle"), intervalMs);
      });
      const result = await Promise.race([pendingRead, idle]);
      clearTimer();
      if (result === "idle") {
        notifyKeepalive(observer);
        controller.enqueue(KEEPALIVE_FRAME.slice());
        return;
      }
      pendingRead = undefined;
      if (result.done) controller.close();
      else controller.enqueue(result.value);
    },
    async cancel(reason) {
      clearTimer();
      await reader.cancel(reason);
    },
  });
  function clearTimer(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
}

function notifyKeepalive(observer: KeepaliveObserver): void {
  try {
    observer.onKeepalive?.();
  } catch {
    // Keepalive health is observational and cannot interrupt the stream.
  }
}
