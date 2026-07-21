import {
  TOOL_APPROVAL_STATES,
  type ToolApprovalInput,
  type ToolApprovalIdentity,
  type ToolApprovalSnapshot,
  type ToolApprovalWorkflowStore,
} from "#application/ports/turn/tools/tool-approval-store";
import type { TelemetrySink } from "#application/ports/telemetry-sink";
import { recordProcessTelemetry } from "#application/telemetry/process-telemetry";
import { recordTelemetrySafely } from "#application/telemetry/record-telemetry-safely";
import { createServerToolInputDigest } from "#application/turn/tools/server-tools/server-tool-input-digest";
import {
  createWorkflowStepStore,
  withWorkflowStepStore,
  type ClosableWorkflowStepStore,
  type WorkflowStepStoreFactory,
} from "#composition/workflow/workflow-step-store";

export type ToolApprovalStepCommand =
  | Readonly<{
      operation: "create";
      databaseUrl: string;
      identity: Omit<ToolApprovalIdentity, "inputDigest">;
      input: ToolApprovalInput;
      timeoutMs: number;
    }>
  | Readonly<{
      operation: "read";
      databaseUrl: string;
      identity: Omit<ToolApprovalIdentity, "inputDigest">;
      input: ToolApprovalInput;
    }>
  | Readonly<{
      operation: "expire";
      databaseUrl: string;
      identity: ToolApprovalIdentity;
    }>;

export type ToolApprovalStepDependencies = Readonly<{
  createStore: WorkflowStepStoreFactory<ToolApprovalWorkflowStore & ClosableWorkflowStepStore>;
  telemetry: Pick<TelemetrySink, "record">;
}>;

const DEFAULT_DEPENDENCIES: ToolApprovalStepDependencies = {
  createStore: createWorkflowStepStore,
  telemetry: { record: recordProcessTelemetry },
};

/** One Node activity owns approval digests, persistence, and pool lifetime. */
export async function runToolApprovalStep(
  command: ToolApprovalStepCommand,
  dependencies: ToolApprovalStepDependencies = DEFAULT_DEPENDENCIES,
): Promise<ToolApprovalSnapshot | undefined> {
  "use step";

  const snapshot = await withWorkflowStepStore(
    command.databaseUrl,
    dependencies.createStore,
    (store) => executeToolApproval(command, store),
  );
  recordApprovalTelemetry(command, snapshot, dependencies.telemetry);
  return snapshot;
}

async function executeToolApproval(
  command: ToolApprovalStepCommand,
  store: ToolApprovalWorkflowStore,
): Promise<ToolApprovalSnapshot | undefined> {
  if (command.operation === "expire") return store.expireApproval(command.identity);

  const inputDigest = await createServerToolInputDigest(command.input);
  const identity = { ...command.identity, inputDigest };
  if (command.operation === "read") return store.readApproval(identity);

  const requestedAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(requestedAt) + command.timeoutMs).toISOString();
  return store.createApproval({ ...identity, requestedAt, expiresAt });
}

function recordApprovalTelemetry(
  command: ToolApprovalStepCommand,
  snapshot: ToolApprovalSnapshot | undefined,
  telemetry: Pick<TelemetrySink, "record">,
): void {
  const outcomeTag = approvalOutcome(command.operation, snapshot);
  if (outcomeTag === undefined) return;
  recordTelemetrySafely(telemetry, {
    type: "tool_approval.wait",
    labels: {
      operation: "tool_approval_wait",
      outcomeTag,
      toolName: command.identity.toolName,
    },
    count: 1,
  });
}

function approvalOutcome(
  operation: ToolApprovalStepCommand["operation"],
  snapshot: ToolApprovalSnapshot | undefined,
): string | undefined {
  if (operation === "create" && snapshot?.state === TOOL_APPROVAL_STATES.REQUESTED) {
    return "requested";
  }
  if (operation === "expire" && snapshot?.state === TOOL_APPROVAL_STATES.EXPIRED) {
    return "expired";
  }
  return undefined;
}
