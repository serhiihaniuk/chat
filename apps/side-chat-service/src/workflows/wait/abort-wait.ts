export function waitForAbort(signal: AbortSignal) {
  let resolveAbort: ((outcome: "abort") => void) | undefined;
  const promise = new Promise<"abort">((resolve) => {
    resolveAbort = resolve;
  });
  const onAbort = () => resolveAbort?.("abort");
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });
  return {
    promise,
    dispose: () => signal.removeEventListener("abort", onAbort),
  };
}
