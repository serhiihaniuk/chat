import { dynamicTool, jsonSchema, type ToolSet } from "ai";
import { createHook, getWritable } from "workflow";

import {
  TOOL_APPROVAL_STATES,
  type ToolApprovalInput,
  type ToolApprovalSnapshot,
} from "#application/ports/turn/tools/tool-approval-store";
import {
  requiresServerToolApproval,
  type DurableActorRef,
  type ServerToolDefinition,
} from "@side-chat/side-chat-server";
import { WORKFLOW_CLOCK, type WorkflowClock } from "../clock/workflow-clock.js";
import type { SuspendableTurnTimeout } from "../timeout/turn-timeout.js";
import {
  CHAT_TURN_JOURNAL_PART_TYPES,
  type ChatTurnJournalPart,
} from "../journal/chat-turn-journal.js";
import {
  deniedToolOutput,
  TOOL_APPROVAL_DENIAL_REASONS,
} from "../tool-approvals/approval-output.js";
import { toolApprovalHookToken } from "../tool-approvals/index.js";
import { runToolApprovalStep } from "../production/approvals/tool-approval.js";
import {
  runApprovedServerToolStep,
  type ApprovedServerToolExecutionCommand,
} from "../production/server-tools/execute-server-tool.js";
import { readServerToolSources, writeServerToolSources } from "./server-tool-sources.js";
import {
  approvalIdentity,
  serverToolExecutionKey,
  serverToolInvocation,
} from "./server-tool-identity.js";
import { waitForAbort } from "../wait/abort-wait.js";

export {
  readServerToolSources,
  writeServerToolSources,
  writeServerToolSourcesTo,
} from "./server-tool-sources.js";

export const TOOL_APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1_000;
export type ToolApprovalStepRunner = typeof runToolApprovalStep;
export type ApprovedServerToolStepRunner = (
  command: ApprovedServerToolExecutionCommand,
) => Promise<unknown>;

export type ApprovalGateDependencies = Readonly<{
  runApprovalStep: ToolApprovalStepRunner;
  runExecutionStep: ApprovedServerToolStepRunner;
}>;

type ApprovalHook = ReturnType<typeof createHook<true>>;

export type ApprovalGateRuntime = Readonly<{
  createApprovalHook: (token: string) => ApprovalHook;
  writeApprovalRequest: (approvalId: string, toolCallId: string) => Promise<true>;
  clock: WorkflowClock;
}>;

const DEFAULT_APPROVAL_GATE_DEPENDENCIES: ApprovalGateDependencies = {
  runApprovalStep: runToolApprovalStep,
  runExecutionStep: runApprovedServerToolStep,
};

type ServerToolRuntimeOptions = Readonly<{
  definitions: readonly ServerToolDefinition[];
  databaseUrl: string | undefined;
  actor: DurableActorRef;
  conversationId: string;
  turnId: string;
  runId: string;
  providerTimeout: SuspendableTurnTimeout;
  abortSignal: AbortSignal;
}>;

export function createServerTools(options: ServerToolRuntimeOptions): ToolSet {
  const databaseUrl = requireDatabase(options);
  return Object.fromEntries(
    options.definitions.map((definition) => [
      definition.name,
      dynamicTool({
        description: definition.description,
        inputSchema: jsonSchema(definition.inputSchema),
        execute: async (input, execution) => {
          if (!isJsonValue(input) || !definition.validateInput(input)) {
            throw new TypeError(`Invalid input for server tool ${definition.name}`);
          }
          const output = !(await requiresServerToolApproval(definition.approvalPolicy, input))
            ? await definition.execute(input, {
                actor: options.actor,
                invocation: serverToolInvocation(options, execution.toolCallId),
                executionKey: serverToolExecutionKey(
                  options.turnId,
                  execution.toolCallId,
                  "ungated",
                ),
              })
            : await executeGatedServerTool({
                ...options,
                databaseUrl,
                toolName: definition.name,
                input,
                toolCallId: execution.toolCallId,
              });
          const sources = readServerToolSources(definition, output);
          if (sources.length > 0) {
            await writeServerToolSources(sources, execution.toolCallId);
          }
          return output;
        },
      }),
    ]),
  );
}

function requireDatabase(options: ServerToolRuntimeOptions): string {
  if (options.definitions.length === 0) return options.databaseUrl ?? "";
  if (options.databaseUrl === undefined) {
    throw new Error("Server tools require configured PostgreSQL persistence");
  }
  return options.databaseUrl;
}

export async function executeGatedServerTool<Input extends ToolApprovalInput>(
  request: Omit<ServerToolRuntimeOptions, "definitions" | "databaseUrl"> &
    Readonly<{
      databaseUrl: string;
      toolName: string;
      input: Input;
      toolCallId: string;
    }>,
  dependencies: ApprovalGateDependencies = DEFAULT_APPROVAL_GATE_DEPENDENCIES,
  runtime?: ApprovalGateRuntime,
): Promise<unknown> {
  const approvalId = `approval-${request.toolCallId}`;
  const persisted = await dependencies.runApprovalStep({
    operation: "create",
    databaseUrl: request.databaseUrl,
    identity: approvalIdentity(request, approvalId),
    input: request.input,
    timeoutMs: TOOL_APPROVAL_TIMEOUT_MS,
  });
  if (persisted === undefined) throw new Error("Tool approval was not persisted");
  const terminal = terminalApproval(persisted);
  if (terminal !== undefined) return resolveApproval(request, terminal, dependencies);

  const timeoutSuspension = request.providerTimeout.suspend();
  const approvalHook = createApprovalHook(
    toolApprovalHookToken(request.runId, approvalId),
    runtime,
  );
  try {
    await writeApprovalRequestWithRuntime(approvalId, request.toolCallId, runtime);
    const conflict = await approvalHook.getConflict();
    if (conflict !== null) {
      throw new Error(`Tool-approval hook token is already owned by run ${conflict.runId}`);
    }
    const registered = await readApproval(request, persisted, dependencies);
    const registeredTerminal = terminalApproval(registered);
    if (registeredTerminal !== undefined) {
      return resolveApproval(request, registeredTerminal, dependencies);
    }
    return await waitForApproval(request, registered, approvalHook, dependencies, runtime);
  } finally {
    approvalHook.dispose();
    timeoutSuspension.release();
  }
}

async function waitForApproval<Input extends ToolApprovalInput>(
  request: Parameters<typeof executeGatedServerTool<Input>>[0],
  approval: ToolApprovalSnapshot,
  approvalHook: ApprovalHook,
  dependencies: ApprovalGateDependencies,
  runtime: ApprovalGateRuntime | undefined,
): Promise<unknown> {
  const abortWait = waitForAbort(request.abortSignal);
  try {
    const clock = runtime?.clock ?? WORKFLOW_CLOCK;
    const remainingMs = Math.max(Date.parse(approval.expiresAt) - clock.now(), 0);
    const winner = await Promise.race([
      Promise.resolve(approvalHook).then(() => "decision" as const),
      clock.wait(remainingMs).then(() => "expiry" as const),
      abortWait.promise,
    ]);
    if (winner === "abort") return deniedToolOutput(TOOL_APPROVAL_DENIAL_REASONS.CANCELLED);
    const settled =
      winner === "expiry"
        ? await dependencies.runApprovalStep({
            operation: "expire",
            databaseUrl: request.databaseUrl,
            identity: approval,
          })
        : await readApproval(request, approval, dependencies);
    if (settled === undefined || settled.state === TOOL_APPROVAL_STATES.REQUESTED) {
      throw new Error("Tool-approval wait completed without a durable decision");
    }
    return resolveApproval(request, settled, dependencies);
  } finally {
    abortWait.dispose();
  }
}

function createApprovalHook(token: string, runtime: ApprovalGateRuntime | undefined): ApprovalHook {
  if (runtime !== undefined) return runtime.createApprovalHook(token);
  return createHook<true>({ token });
}

function writeApprovalRequestWithRuntime(
  approvalId: string,
  toolCallId: string,
  runtime: ApprovalGateRuntime | undefined,
): Promise<true> {
  if (runtime !== undefined) return runtime.writeApprovalRequest(approvalId, toolCallId);
  return writeApprovalRequest(approvalId, toolCallId);
}

async function readApproval<Input extends ToolApprovalInput>(
  request: Parameters<typeof executeGatedServerTool<Input>>[0],
  approval: ToolApprovalSnapshot,
  dependencies: ApprovalGateDependencies,
): Promise<ToolApprovalSnapshot> {
  const current = await dependencies.runApprovalStep({
    operation: "read",
    databaseUrl: request.databaseUrl,
    identity: approvalIdentity(request, approval.approvalId),
    input: request.input,
  });
  if (current === undefined) throw new Error("Tool approval disappeared during durable wait");
  return current;
}

async function resolveApproval<Input extends ToolApprovalInput>(
  request: Parameters<typeof executeGatedServerTool<Input>>[0],
  approval: ToolApprovalSnapshot,
  dependencies: ApprovalGateDependencies,
): Promise<unknown> {
  if (approval.state === TOOL_APPROVAL_STATES.APPROVED) {
    return dependencies.runExecutionStep({
      toolName: request.toolName,
      input: request.input,
      actor: request.actor,
      invocation: serverToolInvocation(request, request.toolCallId),
      executionKey: serverToolExecutionKey(
        request.turnId,
        request.toolCallId,
        approval.inputDigest,
      ),
    });
  }
  return deniedToolOutput(
    approval.state === TOOL_APPROVAL_STATES.EXPIRED
      ? TOOL_APPROVAL_DENIAL_REASONS.EXPIRED
      : TOOL_APPROVAL_DENIAL_REASONS.DENIED,
  );
}

function terminalApproval(approval: ToolApprovalSnapshot): ToolApprovalSnapshot | undefined {
  return approval.state === TOOL_APPROVAL_STATES.REQUESTED ? undefined : approval;
}

async function writeApprovalRequest(approvalId: string, toolCallId: string): Promise<true> {
  "use step";

  const writable = getWritable<ChatTurnJournalPart>();
  const writer = writable.getWriter();
  try {
    await writer.write({
      type: CHAT_TURN_JOURNAL_PART_TYPES.APPROVAL_REQUEST,
      approvalId,
      toolCallId,
    });
  } finally {
    writer.releaseLock();
  }
  return true;
}

function isJsonValue(value: unknown): value is ToolApprovalInput {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}
