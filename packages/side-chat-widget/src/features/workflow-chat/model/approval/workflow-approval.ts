import {
  normalizeWorkflowChatError,
  postWorkflowApprovalDecision,
  type WorkflowChatClient,
  type WorkflowChatHttpError,
} from "#entities/workflow-chat";

export type WorkflowApprovalDecisionState =
  | "approved"
  | "denied"
  | "expired"
  | "foreign"
  | "failed";

export type WorkflowApprovalDecisions = Readonly<Record<string, WorkflowApprovalDecisionState>>;

export type WorkflowApprovalDecisionHandler = (
  approvalId: string,
  approved: boolean,
) => Promise<void>;

/** Post one durable decision and project only the server acknowledgement. */
export async function resolveWorkflowApprovalDecision({
  approvalId,
  approved,
  client,
  runId,
}: Readonly<{
  approvalId: string;
  approved: boolean;
  client: WorkflowChatClient;
  runId: string;
}>): Promise<WorkflowApprovalDecisionState> {
  try {
    const acknowledgement = await postWorkflowApprovalDecision(client, runId, approvalId, approved);
    return approvalStateFromAcknowledgement(acknowledgement.state);
  } catch (error) {
    return approvalFailureState(normalizeWorkflowChatError(error));
  }
}

function approvalStateFromAcknowledgement(state: string): WorkflowApprovalDecisionState {
  if (state === "approved") return "approved";
  if (state === "denied") return "denied";
  if (state === "expired") return "expired";
  return "failed";
}

// The decision endpoint's HTTP status is the widget's boundary signal: 409 means
// the durable decision already moved on (expired or decided), 403/404 means this
// run or decider is not ours to act on. Server error-code strings stay server-owned.
const DECISION_HTTP_STATUS = { CONFLICT: 409, FORBIDDEN: 403, NOT_FOUND: 404 } as const;

function approvalFailureState(error: WorkflowChatHttpError): WorkflowApprovalDecisionState {
  if (error.status === DECISION_HTTP_STATUS.CONFLICT) return "expired";
  if (
    error.status === DECISION_HTTP_STATUS.FORBIDDEN ||
    error.status === DECISION_HTTP_STATUS.NOT_FOUND
  ) {
    return "foreign";
  }
  return "failed";
}
