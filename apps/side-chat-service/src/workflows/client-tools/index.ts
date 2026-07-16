import { dynamicTool, jsonSchema, type ToolSet } from "ai";
import { createHook } from "workflow";
import {
  HookNotFoundError,
  RunExpiredError,
  WorkflowRunNotFoundError,
} from "workflow/internal/errors";
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
import { WORKFLOW_CLOCK, type WorkflowClock } from "../clock/workflow-clock.js";
import { waitForAbort } from "../wait/abort-wait.js";

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
  clientToolCapabilityDigest: string | undefined;
  databaseUrl: string | undefined;
  workspaceId: string;
  turnId: string;
  runId: string;
  timeoutMs: number;
  abortSignal: AbortSignal;
}>;

type PersistedClientToolIdentity = ClientToolDispatchIdentity & Readonly<{ databaseUrl: string }>;
type ClientToolResultHook = ReturnType<typeof createHook<ClientToolResultEnvelope>>;
type ResumeClientToolResult = (token: string, output: ClientToolResultEnvelope) => Promise<unknown>;

export type ClientToolWorkflowDependencies = Readonly<{
  createResultHook: (token: string) => ClientToolResultHook;
  runDispatchStep: typeof runClientToolDispatchStep;
  clock: WorkflowClock;
}>;

export function clientToolResultHookToken(runId: string, toolCallId: string): string {
  return `tool:${runId}:${toolCallId}`;
}

/** Resume a registered wait; a persisted result may legitimately beat hook registration. */
export async function resumeClientToolResult(
  runId: string,
  toolCallId: string,
  output: ClientToolResultEnvelope,
  resumeResult: ResumeClientToolResult = (token, result) => resumeHook(token, result),
): Promise<boolean> {
  try {
    await resumeResult(clientToolResultHookToken(runId, toolCallId), output);
    return true;
  } catch (error) {
    // A durable result can outlive its wait — the hook is gone, or journal pruning
    // removed or expired the run — and `resumeHook` surfaces that as a vanished-wait
    // error, a stable "gone" signal answered with false. Other failures are real
    // infrastructure faults and must not be hidden.
    if (isVanishedWait(error)) return false;
    throw error;
  }
}

function isVanishedWait(error: unknown): boolean {
  return (
    HookNotFoundError.is(error) || WorkflowRunNotFoundError.is(error) || RunExpiredError.is(error)
  );
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
            clientToolCapabilityDigest: requireClientToolCapabilityDigest(options),
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

function requireClientToolCapabilityDigest(options: ClientToolRuntimeOptions): string {
  if (options.clientToolCapabilityDigest !== undefined) return options.clientToolCapabilityDigest;
  throw new Error("Client tools require originating-tab authority");
}

export async function executeClientTool(
  request: Omit<
    ClientToolRuntimeOptions,
    "definitions" | "databaseUrl" | "clientToolCapabilityDigest"
  > &
    Readonly<{
      clientToolCapabilityDigest: string;
      databaseUrl: string;
      toolCallId: string;
      toolName: string;
    }>,
  dependencies?: ClientToolWorkflowDependencies,
): Promise<unknown> {
  const identity: ClientToolDispatchIdentity = {
    workspaceId: request.workspaceId,
    turnId: request.turnId,
    toolCallId: request.toolCallId,
  };
  const persistedIdentity = { ...identity, databaseUrl: request.databaseUrl };
  const dispatch = await runDispatch(
    {
      operation: "create",
      databaseUrl: request.databaseUrl,
      dispatch: {
        ...identity,
        toolName: request.toolName,
        clientToolCapabilityDigest: request.clientToolCapabilityDigest,
      },
    },
    dependencies,
  );
  const existingOutput = clientToolOutput(dispatch);
  if (existingOutput !== undefined) return existingOutput;

  const resultHook = createResultHook(
    clientToolResultHookToken(request.runId, request.toolCallId),
    dependencies,
  );
  try {
    const conflict = await resultHook.getConflict();
    if (conflict !== null) {
      throw new Error(`Client-tool hook token is already owned by run ${conflict.runId}`);
    }

    // Registration suspends durably. Re-read afterwards to close the window in
    // which the result commits before the hook token becomes visible.
    const registeredOutput = clientToolOutput(await readDispatch(persistedIdentity, dependencies));
    if (registeredOutput !== undefined) return registeredOutput;

    return await waitForClientTool({
      request,
      identity: persistedIdentity,
      resultHook,
      dependencies,
    });
  } finally {
    resultHook.dispose();
  }
}

async function waitForClientTool(options: {
  readonly request: Readonly<{ timeoutMs: number; abortSignal: AbortSignal }>;
  readonly identity: PersistedClientToolIdentity;
  readonly resultHook: ClientToolResultHook;
  readonly dependencies: ClientToolWorkflowDependencies | undefined;
}): Promise<unknown> {
  const abortWait = waitForAbort(options.request.abortSignal);
  try {
    const clock = options.dependencies?.clock ?? WORKFLOW_CLOCK;
    const winner = await Promise.race([
      Promise.resolve(options.resultHook).then(() => WAIT_OUTCOMES.RESULT),
      clock.wait(options.request.timeoutMs).then(() => WAIT_OUTCOMES.TIMEOUT),
      abortWait.promise,
    ]);
    if (winner === WAIT_OUTCOMES.RESULT) {
      return requireClientToolOutput(await readDispatch(options.identity, options.dependencies));
    }
    const dispatch =
      winner === WAIT_OUTCOMES.ABORT
        ? await settleDispatch("abort", options.identity, ABORT_OUTPUT, options.dependencies)
        : await settleDispatch("timeout", options.identity, TIMEOUT_OUTPUT, options.dependencies);
    return requireClientToolOutput(dispatch);
  } finally {
    abortWait.dispose();
  }
}

function clientToolOutput(dispatch: ClientToolDispatchSnapshot | undefined): unknown {
  if (dispatch?.state === "dispatched") return undefined;
  return dispatch?.output?.value;
}

function requireClientToolOutput(dispatch: ClientToolDispatchSnapshot | undefined): unknown {
  const output = clientToolOutput(dispatch);
  if (output === undefined) {
    throw new Error("Client-tool wait completed without a persisted terminal output");
  }
  return output;
}

function readDispatch(
  identity: PersistedClientToolIdentity,
  dependencies: ClientToolWorkflowDependencies | undefined,
): Promise<ClientToolDispatchSnapshot | undefined> {
  return runDispatch(
    {
      operation: "read",
      databaseUrl: identity.databaseUrl,
      dispatch: toDispatchIdentity(identity),
    },
    dependencies,
  );
}

function settleDispatch(
  operation: "timeout" | "abort",
  identity: PersistedClientToolIdentity,
  output: ClientToolOutputEnvelope,
  dependencies: ClientToolWorkflowDependencies | undefined,
): Promise<ClientToolDispatchSnapshot | undefined> {
  return runDispatch(
    {
      operation,
      databaseUrl: identity.databaseUrl,
      dispatch: toDispatchIdentity(identity),
      output,
    },
    dependencies,
  );
}

function runDispatch(
  command: Parameters<typeof runClientToolDispatchStep>[0],
  dependencies: ClientToolWorkflowDependencies | undefined,
): Promise<ClientToolDispatchSnapshot | undefined> {
  if (dependencies !== undefined) return dependencies.runDispatchStep(command);
  return runClientToolDispatchStep(command);
}

function createResultHook(
  token: string,
  dependencies: ClientToolWorkflowDependencies | undefined,
): ClientToolResultHook {
  if (dependencies !== undefined) return dependencies.createResultHook(token);
  return createHook<ClientToolResultEnvelope>({ token });
}

function toDispatchIdentity(identity: PersistedClientToolIdentity): ClientToolDispatchIdentity {
  return {
    workspaceId: identity.workspaceId,
    turnId: identity.turnId,
    toolCallId: identity.toolCallId,
  };
}
