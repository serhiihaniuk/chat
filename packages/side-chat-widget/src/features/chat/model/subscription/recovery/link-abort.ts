/**
 * Forward an outer AbortSignal into an inner AbortController, returning the unlink.
 *
 * Source is the caller-owned signal (user cancel, run replaced); target is one
 * attempt's private controller, so the attempt's watchdog can abort its own
 * connection without touching the caller's signal while an outer abort still
 * stops everything. Invariant: the returned unlink MUST run when the attempt
 * settles, or the outer signal accumulates dead listeners across retries.
 */
export const linkAbort = (outer: AbortSignal, inner: AbortController): (() => void) => {
  if (outer.aborted) {
    inner.abort(outer.reason);
    return () => undefined;
  }
  const forward = (): void => {
    inner.abort(outer.reason);
  };
  outer.addEventListener("abort", forward);
  return () => {
    outer.removeEventListener("abort", forward);
  };
};
