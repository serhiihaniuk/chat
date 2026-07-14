import type { ToolApprovalInput } from "#application/ports/turn/tools/tool-approval-store";
import { findConfiguredProductionServerTool } from "#composition/workflow/production";
import {
  requiresServerToolApproval,
  type ServerToolDefinition,
} from "#application/turn/tools/server-tools/server-tool-catalog";
import {
  deniedToolOutput,
  TOOL_APPROVAL_DENIAL_REASONS,
} from "../../tool-approvals/approval-output.js";

export type ApprovedServerToolExecutionCommand = Readonly<{
  toolName: string;
  input: ToolApprovalInput;
  executionKey: string;
}>;

/** Reload current policy/schema inside the idempotent mutating activity. */
export async function runApprovedServerToolStep(
  command: ApprovedServerToolExecutionCommand,
): Promise<unknown> {
  "use step";

  const definition = findConfiguredProductionServerTool(command.toolName);
  return executeApprovedServerTool(definition, command);
}

export async function executeApprovedServerTool<Input extends ToolApprovalInput>(
  definition: ServerToolDefinition<Input> | undefined,
  command: ApprovedServerToolExecutionCommand,
): Promise<unknown> {
  if (definition === undefined) {
    return deniedToolOutput(TOOL_APPROVAL_DENIAL_REASONS.TOOL_CHANGED);
  }
  if (!definition.validateInput(command.input)) {
    return deniedToolOutput(TOOL_APPROVAL_DENIAL_REASONS.SCHEMA_CHANGED);
  }
  if (!(await requiresServerToolApproval(definition.approvalPolicy, command.input))) {
    return deniedToolOutput(TOOL_APPROVAL_DENIAL_REASONS.POLICY_CHANGED);
  }
  return definition.execute(command.input, { executionKey: command.executionKey });
}
