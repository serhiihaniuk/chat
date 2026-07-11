import { dynamicTool, jsonSchema, type ToolSet } from "ai";
import { createHook, sleep } from "workflow";
import { HookNotFoundError } from "workflow/internal/errors";
import { resumeHook } from "workflow/api";

import type {
  ClientToolDispatchIdentity,
  ClientToolDispatchSnapshot,
  ClientToolOutputEnvelope,
} from "#application/ports/turn/tools/client-tool-dispatch-store";
import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";

import {
  runClientToolDispatchStep,
  type ClientToolResultEnvelope,
} from "../production/client-tool-dispatch.js";

export { preserveDynamicClientToolIdentity } from "./dynamic-identity.js";

const WAIT_OUTCOMES = {
  RESULT: "result",
  TIMEOUT: "timeout",
  ABORT: "abort",
} as const;

const TIMEOUT_OUTPUT = {
  value: {
    status: "error",
    error: { code: "client_tool_timeout", message: "Client tool timed out." },
  },
} as const satisfies ClientToolResultEnvelope;

const ABORT_OUTPUT = {
  value: {
    status: "error",
    error: {
      code: "client_tool_aborted",
      message: "Client tool execution was cancelled.",
    },
  },
} as const satisfies ClientToolResultEnvelope;

type ClientToolRuntimeOptions = Readonly<{
  definitions: readonly ClientToolDefinition[];
  databaseUrl: string | undefined;
  workspaceId: string;
  turnId: string;
  runId: string;
  timeoutMs: number;
  abortSignal: AbortSignal;
}>;

type PersistedClientToolIdentity = ClientToolDispatchIdentity &
  Readonly<{ databaseUrl: string }>;

export function clientToolResultHookToken(
  runId: string,
  toolCallId: string,
): string {
  return `tool:${runId}:${toolCallId}`;
}

/** Resume a registered wait; a persisted result may legitimately beat hook registration. */
export async function resumeClientToolResult(
  runId: string,
  toolCallId: string,
  output: ClientToolResultEnvelope,
): Promise<boolean> {
  try {
    await resumeHook(clientToolResultHookToken(runId, toolCallId), output);
    return true;
  } catch (error) {
    if (HookNotFoundError.is(error)) return false;
    throw error;
  }
}

export function createClientTools(options: ClientToolRuntimeOptions): ToolSet {
  const databaseUrl = requireDatabase(options);
  return Object.fromEntries(
    options.definitions.map((definition) => [
      definition.name,
      dynamicTool({
        description: definition.description,
        inputSchema: jsonSchema(definition.inputSchema),
        execute: async (_toolInput, execution) =>
          executeClientTool({
            ...options,
            databaseUrl,
            toolCallId: execution.toolCallId,
            toolName: definition.name,
          }),
      }),
    ]),
  );
}

function requireDatabase(options: ClientToolRuntimeOptions): string {
  if (options.definitions.length === 0) return options.databaseUrl ?? "";
  if (options.databaseUrl === undefined) {
    throw new Error("Client tools require configured PostgreSQL persistence");
  }
  return options.databaseUrl;
}

export async function executeClientTool(
  request: Omit<ClientToolRuntimeOptions, "definitions" | "databaseUrl"> &
    Readonly<{ databaseUrl: string; toolCallId: string; toolName: string }>,
): Promise<unknown> {
  const identity: ClientToolDispatchIdentity = {
    workspaceId: request.workspaceId,
    turnId: request.turnId,
    toolCallId: request.toolCallId,
  };
  const persistedIdentity = { ...identity, databaseUrl: request.databaseUrl };
  const dispatch = await runClientToolDispatchStep({
    operation: "create",
    databaseUrl: request.databaseUrl,
    dispatch: { ...identity, toolName: request.toolName },
  });
  const existingOutput = clientToolOutput(dispatch);
  if (existingOutput !== undefined) return existingOutput;

  const resultHook = createHook<ClientToolResultEnvelope>({
    token: clientToolResultHookToken(request.runId, request.toolCallId),
  });
  try {
    const conflict = await resultHook.getConflict();
    if (conflict !== null) {
      throw new Error(
        `Client-tool hook token is already owned by run ${conflict.runId}`,
      );
    }

    // Registration suspends durably. Re-read afterwards to close the window in
    // which the result commits before the hook token becomes visible.
    const registeredOutput = clientToolOutput(
      await readDispatch(persistedIdentity),
    );
    if (registeredOutput !== undefined) return registeredOutput;

    return await waitForClientTool({
      request,
      identity: persistedIdentity,
      resultHook,
    });
  } finally {
    resultHook.dispose();
  }
}

async function waitForClientTool(options: {
  readonly request: Readonly<{ timeoutMs: number; abortSignal: AbortSignal }>;
  readonly identity: PersistedClientToolIdentity;
  readonly resultHook: ReturnType<typeof createHook<ClientToolResultEnvelope>>;
}): Promise<unknown> {
  const abortWait = waitForAbort(options.request.abortSignal);
  try {
    const winner = await Promise.race([
      Promise.resolve(options.resultHook).then(() => WAIT_OUTCOMES.RESULT),
      sleep(`${options.request.timeoutMs}ms`).then(() => WAIT_OUTCOMES.TIMEOUT),
      abortWait.promise,
    ]);
    if (winner === WAIT_OUTCOMES.RESULT) {
      return requireClientToolOutput(await readDispatch(options.identity));
    }
    const dispatch =
      winner === WAIT_OUTCOMES.ABORT
        ? await settleDispatch("abort", options.identity, ABORT_OUTPUT)
        : await settleDispatch("timeout", options.identity, TIMEOUT_OUTPUT);
    return requireClientToolOutput(dispatch);
  } finally {
    abortWait.dispose();
  }
}

function clientToolOutput(
  dispatch: ClientToolDispatchSnapshot | undefined,
): unknown {
  if (dispatch?.state === "dispatched") return undefined;
  return dispatch?.output?.value;
}

function requireClientToolOutput(
  dispatch: ClientToolDispatchSnapshot | undefined,
): unknown {
  const output = clientToolOutput(dispatch);
  if (output === undefined) {
    throw new Error(
      "Client-tool wait completed without a persisted terminal output",
    );
  }
  return output;
}

function readDispatch(
  identity: PersistedClientToolIdentity,
): Promise<ClientToolDispatchSnapshot | undefined> {
  return runClientToolDispatchStep({
    operation: "read",
    databaseUrl: identity.databaseUrl,
    dispatch: toDispatchIdentity(identity),
  });
}

function settleDispatch(
  operation: "timeout" | "abort",
  identity: PersistedClientToolIdentity,
  output: ClientToolOutputEnvelope,
): Promise<ClientToolDispatchSnapshot | undefined> {
  return runClientToolDispatchStep({
    operation,
    databaseUrl: identity.databaseUrl,
    dispatch: toDispatchIdentity(identity),
    output,
  });
}

function toDispatchIdentity(
  identity: PersistedClientToolIdentity,
): ClientToolDispatchIdentity {
  return {
    workspaceId: identity.workspaceId,
    turnId: identity.turnId,
    toolCallId: identity.toolCallId,
  };
}

function waitForAbort(signal: AbortSignal): {
  readonly promise: Promise<typeof WAIT_OUTCOMES.ABORT>;
  readonly dispose: () => void;
} {
  let resolveAbort: ((outcome: typeof WAIT_OUTCOMES.ABORT) => void) | undefined;
  const promise = new Promise<typeof WAIT_OUTCOMES.ABORT>((resolve) => {
    resolveAbort = resolve;
  });
  const onAbort = () => resolveAbort?.(WAIT_OUTCOMES.ABORT);
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });
  return {
    promise,
    dispose: () => signal.removeEventListener("abort", onAbort),
  };
}
