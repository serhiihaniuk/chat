/** Invoke one release callback when a response stream completes, fails, or is cancelled. */
export function trackStreamLifecycle<T>(
  source: ReadableStream<T>,
  release: () => void,
): ReadableStream<T> {
  let reader: ReadableStreamDefaultReader<T>;
  try {
    reader = source.getReader();
  } catch (error) {
    release();
    throw error;
  }

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
    cancel: async (reason) => {
      try {
        await reader.cancel(reason);
      } finally {
        release();
      }
    },
  });
}
