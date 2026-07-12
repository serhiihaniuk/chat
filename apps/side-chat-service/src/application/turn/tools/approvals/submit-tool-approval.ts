import {
  TOOL_APPROVAL_DECISION_DISPOSITIONS,
  TOOL_APPROVAL_LOOKUP,
  type ToolApprovalDecisionStore,
} from "#application/ports/turn/tools/tool-approval-store";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { AuthContext } from "#domain/auth-context";

export type ResumeToolApproval = (runId: string, approvalId: string) => Promise<boolean>;

export type SubmitToolApprovalInput = Readonly<{
  auth: AuthContext;
  runId: string;
  approvalId: string;
  requestId: string;
  readDecision: () => Promise<
    | Readonly<{ valid: true; approved: boolean; reason?: string | undefined }>
    | Readonly<{ valid: false }>
  >;
}>;

/** Persist the authorized decision before treating its Workflow hook as a wake signal. */
export async function submitToolApproval(
  store: ToolApprovalDecisionStore,
  resume: ResumeToolApproval,
  input: SubmitToolApprovalInput,
) {
  const approval = await store.findOwnedApproval(input.auth, input.runId, input.approvalId);
  if (approval === TOOL_APPROVAL_LOOKUP.NOT_FOUND) {
    throw new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Tool approval not found");
  }
  if (approval === TOOL_APPROVAL_LOOKUP.NOT_READY) {
    throw new TurnRejectedError(
      TURN_REJECTION_CODES.TOOL_APPROVAL_NOT_READY,
      "Tool approval is not ready for a decision",
      1,
    );
  }

  const decision = await input.readDecision();
  if (!decision.valid) {
    throw new TurnRejectedError(
      TURN_REJECTION_CODES.INVALID_TOOL_APPROVAL,
      "Invalid tool approval decision",
    );
  }
  const result = await store.decideApproval(approval, {
    approved: decision.approved,
    requestId: input.requestId,
    ...(decision.reason === undefined ? {} : { reason: decision.reason }),
  });
  if (
    result.disposition === TOOL_APPROVAL_DECISION_DISPOSITIONS.CONFLICT ||
    result.disposition === TOOL_APPROVAL_DECISION_DISPOSITIONS.LATE
  ) {
    throw new TurnRejectedError(
      TURN_REJECTION_CODES.TOOL_APPROVAL_CONFLICT,
      "Tool approval can no longer accept this decision",
    );
  }
  const resumed = await resume(input.runId, input.approvalId);
  return {
    runId: input.runId,
    approvalId: input.approvalId,
    state: result.state,
    accepted: result.disposition === TOOL_APPROVAL_DECISION_DISPOSITIONS.ACCEPTED,
    resumed,
  };
}
