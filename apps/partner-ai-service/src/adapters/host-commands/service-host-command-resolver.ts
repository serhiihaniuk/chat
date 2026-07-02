import type { HostCommandResolveRequest, HostCommandResolver } from "@side-chat/agent-runtime";
import type { ClockPort } from "@side-chat/partner-ai-core";
import type { JsonObject } from "@side-chat/shared";
import type { SidechatRepositories } from "@side-chat/db";

/**
 * Service implementation of the runtime {@link HostCommandResolver}, connection-bound.
 *
 * A UI (host) tool runs in the browser, so the runtime cannot execute it: the tool
 * asks this resolver for the browser's result. The resolver is connection-bound:
 * - no client streaming the turn → an immediate `no_connected_client` result, so
 *   the model adapts instead of waiting on a browser that will never answer;
 * - a client present → an `emitted` row is persisted (the durable proof that this
 *   command belongs to this turn — any instance's result route validates against
 *   it), the `host_command` activity reaches the browser over the live stream,
 *   and the browser POSTs the result. If that POST lands here, `resolveResult`
 *   settles directly (the fast path); if it lands on another instance, the
 *   persisted result reaches this owner via the NOTIFY-driven dispatcher or the
 *   low-frequency result poll — correctness never depends on NOTIFY delivery
 *   (ADR 0009). A timeout backstop guarantees the tool loop never hangs.
 */
export type ServiceHostCommandResolver = HostCommandResolver & {
  /**
   * Resolve a pending UI tool call with the browser's result.
   *
   * Settle is bound to the turn: the command must be pending under this exact
   * `(assistantTurnId, commandId)` pair, so a leaked commandId can never settle
   * through a different turn. Returns false when nothing is pending for the pair
   * (unknown, already resolved, timed out, or owned by another instance).
   */
  readonly resolveResult: (input: {
    readonly assistantTurnId: string;
    readonly commandId: string;
    readonly result: JsonObject;
  }) => boolean;
};

/** Default backstop: a host command unanswered for this long resolves as timed out. */
export const DEFAULT_HOST_COMMAND_RESULT_TIMEOUT_MS = 30_000;

/** Default cadence for the owner's persisted-result poll (the missed-NOTIFY backstop). */
export const DEFAULT_HOST_COMMAND_RESULT_POLL_INTERVAL_MS = 2_000;

/** The durable half of the relay; the resolver only writes emits and reads results. */
export type HostCommandResultStore = Pick<
  SidechatRepositories,
  "findHostCommandResult" | "recordHostCommandResult"
>;

export type ServiceHostCommandResolverInput = {
  /** Whether a client is currently streaming the turn (so a host command can run). */
  readonly hasConnectedClient: (assistantTurnId: string) => boolean;
  /** Backstop window (ms) before an unanswered host command resolves as timed out. */
  readonly timeoutMs: number;
  readonly repositories: HostCommandResultStore;
  /** The composition's workspace; commands and results are scoped to it. */
  readonly workspaceId: string;
  readonly clock: ClockPort;
  readonly resultPollIntervalMs?: number | undefined;
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

const pendingKey = (assistantTurnId: string, commandId: string): string =>
  `${assistantTurnId}::${commandId}`;

export const createServiceHostCommandResolver = (
  input: ServiceHostCommandResolverInput,
): ServiceHostCommandResolver => {
  const pending = new Map<string, PendingCommand>();

  const awaitResult = async (request: HostCommandResolveRequest): Promise<JsonObject> => {
    if (!input.hasConnectedClient(request.assistantTurnId)) {
      return NO_CONNECTED_CLIENT_RESULT;
    }
    // The durable emit is what binds commandId to this turn for every instance's
    // result route. A failed write is swallowed: the local fast path still works,
    // only the cross-instance relay (which reads this row) is degraded.
    await persistEmittedCommand(input, request).catch(() => undefined);
    return new Promise<JsonObject>((resolve, reject) =>
      registerPending(pending, input, request, resolve, reject),
    );
  };

  return {
    awaitResult,
    resolveResult: ({ assistantTurnId, commandId, result }) => {
      const entry = pending.get(pendingKey(assistantTurnId, commandId));
      if (!entry) return false;
      entry.settle(result);
      return true;
    },
  };
};

/** Persist the `emitted` row before the command reaches the browser. */
const persistEmittedCommand = async (
  input: ServiceHostCommandResolverInput,
  request: HostCommandResolveRequest,
): Promise<void> => {
  await input.repositories.recordHostCommandResult({
    workspaceId: input.workspaceId,
    assistantTurnId: request.assistantTurnId,
    commandId: request.commandId,
    commandType: request.commandName,
    status: "emitted",
    resultCode: "pending",
    commandRedactedJson: request.payload,
    now: input.clock.now(),
  });
};

/**
 * Arm one pending host command with a timeout, abort listener, and result poll.
 *
 * `cleanup` is single-shot (the `settled` guard), so the timeout, an abort, a
 * direct browser result, and a polled persisted result race to settle exactly
 * once and always clear both timers and the abort listener. The poll is the
 * relay's belt-and-braces half: a result persisted by another instance settles
 * here within one poll interval even if the NOTIFY signal was lost.
 */
const registerPending = (
  pending: Map<string, PendingCommand>,
  input: ServiceHostCommandResolverInput,
  request: HostCommandResolveRequest,
  resolve: (result: JsonObject) => void,
  reject: (error: Error) => void,
): void => {
  const key = pendingKey(request.assistantTurnId, request.commandId);
  let settled = false;
  const cleanup = (): boolean => {
    if (settled) return false;
    settled = true;
    clearTimeout(timer);
    clearInterval(poll);
    request.abortSignal?.removeEventListener("abort", onAbort);
    pending.delete(key);
    return true;
  };
  const onAbort = (): void => {
    if (cleanup()) reject(new Error("Host command resolution was aborted."));
  };
  const timer = setTimeout(() => {
    if (cleanup()) resolve(TIMED_OUT_RESULT);
  }, input.timeoutMs);
  timer.unref();
  const poll = setInterval(() => {
    void settleFromPersistedResult(input, request, (result) => {
      if (cleanup()) resolve(result);
    });
  }, input.resultPollIntervalMs ?? DEFAULT_HOST_COMMAND_RESULT_POLL_INTERVAL_MS);
  poll.unref();
  request.abortSignal?.addEventListener("abort", onAbort, { once: true });
  pending.set(key, {
    settle: (result) => {
      if (cleanup()) resolve(result);
    },
  });
};

/** Read the durable row; a resolved result settles the pending command. */
const settleFromPersistedResult = async (
  input: ServiceHostCommandResolverInput,
  request: HostCommandResolveRequest,
  settle: (result: JsonObject) => void,
): Promise<void> => {
  try {
    const record = await input.repositories.findHostCommandResult({
      workspaceId: input.workspaceId,
      assistantTurnId: request.assistantTurnId,
      commandId: request.commandId,
    });
    if (record?.resolvedAt !== undefined) settle(record.resultRedactedJson ?? {});
  } catch {
    // A failed poll read is retried on the next tick; the timeout is the backstop.
  }
};
