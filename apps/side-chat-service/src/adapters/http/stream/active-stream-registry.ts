export type ActiveStreamSnapshot = Readonly<{
  active: number;
  accepting: boolean;
}>;

type ActiveReader = Readonly<{
  cancel: (reason?: unknown) => Promise<void>;
}>;

/** Owns live HTTP response readers so shutdown can end SSE and keepalive work first. */
export class ActiveStreamRegistry {
  readonly #readers = new Set<ActiveReader>();
  #accepting = true;
  #shutdown: Promise<void> | undefined;

  track<T>(source: ReadableStream<T>): ReadableStream<T> {
    if (!this.#accepting) {
      void source.cancel(shutdownReason()).catch(() => undefined);
      return new ReadableStream<T>({ start: (controller) => controller.close() });
    }

    const reader = source.getReader();
    let active = true;
    const release = (): void => {
      if (!active) return;
      active = false;
      this.#readers.delete(ownedReader);
    };
    const ownedReader: ActiveReader = {
      cancel: async (reason) => {
        if (!active) return;
        release();
        await reader.cancel(reason);
      },
    };
    this.#readers.add(ownedReader);

    return new ReadableStream<T>({
      pull: async (controller) => {
        try {
          const next = await reader.read();
          if (next.done) {
            release();
            controller.close();
            return;
          }
          controller.enqueue(next.value);
        } catch (error) {
          release();
          controller.error(error);
        }
      },
      cancel: (reason) => ownedReader.cancel(reason),
    });
  }

  shutdown(): Promise<void> {
    this.#shutdown ??= this.#closeAll();
    return this.#shutdown;
  }

  snapshot(): ActiveStreamSnapshot {
    return { active: this.#readers.size, accepting: this.#accepting };
  }

  async #closeAll(): Promise<void> {
    this.#accepting = false;
    const reason = shutdownReason();
    await Promise.allSettled([...this.#readers].map((reader) => reader.cancel(reason)));
  }
}

function shutdownReason(): DOMException {
  return new DOMException("Service is shutting down", "AbortError");
}
