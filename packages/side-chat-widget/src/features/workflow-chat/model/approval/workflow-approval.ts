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
  reason?: string,
) => Promise<void>;

type ApprovalChat = Readonly<{
  addToolApprovalResponse: (options: {
    readonly id: string;
    readonly approved: boolean;
    readonly reason?: string;
  }) => void | PromiseLike<void>;
}>;

export function createWorkflowApprovalDecisionHandler({
  activeRunIdRef,
  approvalRequestsInFlightRef,
  chat,
  clientRef,
  setApprovalDecisions,
}: {
  readonly activeRunIdRef: { current: string | undefined };
  readonly approvalRequestsInFlightRef: { current: Set<string> };
  readonly chat: ApprovalChat;
  readonly clientRef: { current: WorkflowChatClient };
  readonly setApprovalDecisions: (
    update: (current: WorkflowApprovalDecisions) => WorkflowApprovalDecisions,
  ) => void;
}): WorkflowApprovalDecisionHandler {
  return async (approvalId, approved, reason): Promise<void> => {
    if (approvalRequestsInFlightRef.current.has(approvalId)) return;
    approvalRequestsInFlightRef.current.add(approvalId);
    const runId = activeRunIdRef.current;
    if (!runId) {
      setApprovalDecisions((current) => ({
        ...current,
        [approvalId]: "failed",
      }));
      approvalRequestsInFlightRef.current.delete(approvalId);
      return;
    }
    try {
      const acknowledgement = await postWorkflowApprovalDecision(
        clientRef.current,
        runId,
        approvalId,
        approved,
        reason,
      );
      const state = approvalStateFromAcknowledgement(acknowledgement.state);
      setApprovalDecisions((current) => ({ ...current, [approvalId]: state }));
      if (state === "approved" || state === "denied") {
        await addApprovalResponse(chat, approvalId, state === "approved", reason);
      }
    } catch (error) {
      const normalized = normalizeWorkflowChatError(error);
      setApprovalDecisions((current) => ({
        ...current,
        [approvalId]: approvalFailureState(normalized),
      }));
    } finally {
      approvalRequestsInFlightRef.current.delete(approvalId);
    }
  };
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

async function addApprovalResponse(
  chat: ApprovalChat,
  approvalId: string,
  approved: boolean,
  reason?: string,
): Promise<void> {
  try {
    const normalizedReason = reason?.trim();
    if (normalizedReason === undefined || normalizedReason === "") {
      await chat.addToolApprovalResponse({ id: approvalId, approved });
      return;
    }
    await chat.addToolApprovalResponse({
      id: approvalId,
      approved,
      reason: normalizedReason,
    });
  } catch {
    // The durable acknowledgement is authoritative; stale local parts stay calm.
  }
}
