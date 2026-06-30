import type { HostCommandResolveRequest, HostCommandResolver } from "@side-chat/agent-runtime";
import type { JsonObject } from "@side-chat/shared";

/**
 * Service implementation of the runtime {@link HostCommandResolver}, connection-bound.
 *
 * A UI (host) tool runs in the browser, so the runtime cannot execute it: the tool
 * asks this resolver for the browser's result. The resolver is connection-bound:
 * - no client streaming the turn → an immediate `no_connected_client` result, so
 *   the model adapts instead of waiting on a browser that will never answer;
 * - a client present → the `host_command` activity reaches it over the live stream;
 *   the browser dispatches the command and POSTs the result, which `resolveResult`
 *   hands back here. A timeout backstop guarantees the tool loop never hangs.
 */
export type ServiceHostCommandResolver = HostCommandResolver & {
  /**
   * Resolve a pending UI tool call with the browser's result.
   *
   * Returns false when no call is pending for the id (unknown, already resolved, or
   * timed out), so the result route can answer 404 rather than silently drop it.
   */
  readonly resolveResult: (input: {
    readonly commandId: string;
    readonly result: JsonObject;
  }) => boolean;
};

/** Default backstop: a host command unanswered for this long resolves as timed out. */
export const DEFAULT_HOST_COMMAND_RESULT_TIMEOUT_MS = 30_000;

export type ServiceHostCommandResolverInput = {
  /** Whether a client is currently streaming the turn (so a host command can run). */
  readonly hasConnectedClient: (assistantTurnId: string) => boolean;
  /** Backstop window (ms) before an unanswered host command resolves as timed out. */
  readonly timeoutMs: number;
};

type PendingCommand = {
  readonly settle: (result: JsonObject) => void;
};

const NO_CONNECTED_CLIENT_RESULT: JsonObject = {
  status: "error",
  code: "no_connected_client",
  detail: "No connected client is streaming this turn, so the host command cannot run.",
};

const TIMED_OUT_RESULT: JsonObject = {
  status: "error",
  code: "timed_out",
  detail: "The host command timed out waiting for the browser to return a result.",
};

export const createServiceHostCommandResolver = (
  input: ServiceHostCommandResolverInput,
): ServiceHostCommandResolver => {
  const pending = new Map<string, PendingCommand>();

  const awaitResult = (request: HostCommandResolveRequest): Promise<JsonObject> => {
    if (!input.hasConnectedClient(request.assistantTurnId)) {
      return Promise.resolve(NO_CONNECTED_CLIENT_RESULT);
    }
    return new Promise<JsonObject>((resolve, reject) =>
      registerPending(pending, input.timeoutMs, request, resolve, reject),
    );
  };

  return {
    awaitResult,
    resolveResult: ({ commandId, result }) => {
      const entry = pending.get(commandId);
      if (!entry) return false;
      entry.settle(result);
      return true;
    },
  };
};

/**
 * Arm one pending host command with a timeout and abort listener.
 *
 * `cleanup` is single-shot (the `settled` guard), so the timeout, an abort, and a
 * browser result race to settle exactly once and always clear the timer and the
 * abort listener — the resolver never leaks a timer or resolves twice.
 */
const registerPending = (
  pending: Map<string, PendingCommand>,
  timeoutMs: number,
  request: HostCommandResolveRequest,
  resolve: (result: JsonObject) => void,
  reject: (error: Error) => void,
): void => {
  let settled = false;
  const cleanup = (): boolean => {
    if (settled) return false;
    settled = true;
    clearTimeout(timer);
    request.abortSignal?.removeEventListener("abort", onAbort);
    pending.delete(request.commandId);
    return true;
  };
  const onAbort = (): void => {
    if (cleanup()) reject(new Error("Host command resolution was aborted."));
  };
  const timer = setTimeout(() => {
    if (cleanup()) resolve(TIMED_OUT_RESULT);
  }, timeoutMs);
  timer.unref();
  request.abortSignal?.addEventListener("abort", onAbort, { once: true });
  pending.set(request.commandId, {
    settle: (result) => {
      if (cleanup()) resolve(result);
    },
  });
};
