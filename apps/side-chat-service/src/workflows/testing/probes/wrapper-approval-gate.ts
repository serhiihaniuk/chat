import { getWorkflowMetadata } from "workflow";
import { resumeHook, start } from "workflow/api";

import { TOOL_APPROVAL_STATES } from "#application/ports/turn/tools/tool-approval-store";
import {
  executeGatedServerTool,
  type ApprovedServerToolStepRunner,
  type ToolApprovalStepRunner,
} from "../../server-tools/index.js";
import {
  deniedToolOutput,
  TOOL_APPROVAL_DENIAL_REASONS,
} from "../../tool-approvals/approval-output.js";
import { toolApprovalHookToken } from "../../tool-approvals/index.js";
import { isWorkflowRecord } from "../../tool-approvals/workflow-value-guards.js";

const PROBE = {
  APPROVAL_REQUESTED: "wrapper-approval-requested",
  SIDE_EFFECT_EXECUTED: "wrapper-side-effect-executed",
  OBSERVATION_PREFIX: "[compatibility-observation]",
  TOOL_NAME: "jira.create_issue",
} as const;

const approvalReads = new Map<string, number>();

export async function startWrapperApprovalGateProbe(requestId: string) {
  const toolCallId = `wrapper-${requestId}`;
  const run = await start(probeWrapperApprovalGate, [requestId, toolCallId]);
  return { runId: run.runId, approvalId: `approval-${toolCallId}` };
}

export async function approveWrapperApprovalGate(
  runId: string,
  approvalId: string,
): Promise<boolean> {
  try {
    await resumeHook(toolApprovalHookToken(runId, approvalId), true);
    return true;
  } catch {
    return false;
  }
}

/** Compiled proof that the Side Chat wrapper, unlike native `needsApproval`, suspends execution. */
export async function probeWrapperApprovalGate(requestId: string, toolCallId: string) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  return executeGatedServerTool(
    {
      toolName: PROBE.TOOL_NAME,
      input: { requestId },
      databaseUrl: "compatibility://approval-gate",
      workspaceId: "compatibility-workspace",
      subjectId: "compatibility-subject",
      conversationId: "compatibility-conversation",
      turnId: `turn-${requestId}`,
      runId: workflowRunId,
      toolCallId,
      providerTimeout: {
        suspend: () => ({ release: () => undefined }),
        waitUntilElapsed: () => new Promise(() => undefined),
      },
      abortSignal: new AbortController().signal,
    },
    {
      runApprovalStep: runCompatibilityApprovalStep,
      runExecutionStep: runCompatibilityExecutionStep,
    },
  );
}

const runCompatibilityApprovalStep: ToolApprovalStepRunner = async (command) => {
  "use step";

  await Promise.resolve();
  const identity = command.identity;
  if (command.operation === "create") {
    approvalReads.set(identity.approvalId, 0);
    recordObservation(PROBE.APPROVAL_REQUESTED, requestIdFromToolCall(identity.toolCallId));
    return snapshot(identity, TOOL_APPROVAL_STATES.REQUESTED);
  }
  if (command.operation === "expire") return snapshot(identity, TOOL_APPROVAL_STATES.EXPIRED);
  const readCount = (approvalReads.get(identity.approvalId) ?? 0) + 1;
  approvalReads.set(identity.approvalId, readCount);
  return snapshot(
    identity,
    readCount === 1 ? TOOL_APPROVAL_STATES.REQUESTED : TOOL_APPROVAL_STATES.APPROVED,
  );
};

const runCompatibilityExecutionStep: ApprovedServerToolStepRunner = async (command) => {
  "use step";

  await Promise.resolve();
  const input = command.input;
  if (!isWorkflowRecord(input) || typeof input["requestId"] !== "string") {
    return deniedToolOutput(TOOL_APPROVAL_DENIAL_REASONS.SCHEMA_CHANGED);
  }
  recordObservation(PROBE.SIDE_EFFECT_EXECUTED, input["requestId"]);
  return { created: true } as const;
};

function snapshot(
  identity: Readonly<{
    workspaceId: string;
    subjectId: string;
    conversationId: string;
    turnId: string;
    runId: string;
    approvalId: string;
    toolCallId: string;
    toolName: string;
    inputDigest?: string;
  }>,
  state:
    | typeof TOOL_APPROVAL_STATES.REQUESTED
    | typeof TOOL_APPROVAL_STATES.APPROVED
    | typeof TOOL_APPROVAL_STATES.EXPIRED,
) {
  const base = {
    ...identity,
    inputDigest: identity.inputDigest ?? "sha256:compiled-wrapper-probe",
    requestedAt: "2026-07-12T12:00:00.000Z",
    expiresAt: "2099-07-13T12:00:00.000Z",
    state,
  };
  return state === TOOL_APPROVAL_STATES.APPROVED ? { ...base, approved: true } : base;
}

function recordObservation(event: string, requestId: string): void {
  console.log(`${PROBE.OBSERVATION_PREFIX} ${JSON.stringify({ event, requestId })}`);
}

function requestIdFromToolCall(toolCallId: string): string {
  return toolCallId.startsWith("wrapper-") ? toolCallId.slice("wrapper-".length) : toolCallId;
}
