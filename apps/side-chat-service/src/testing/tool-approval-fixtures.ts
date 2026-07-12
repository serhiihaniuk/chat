import {
  TOOL_APPROVAL_DECISION_DISPOSITIONS,
  TOOL_APPROVAL_STATES,
  type ToolApprovalDecisionRef,
  type ToolApprovalDecisionResult,
  type ToolApprovalDecisionStore,
  type ToolApprovalLookup,
  type ToolApprovalSnapshot,
} from "#application/ports/turn/tools/tool-approval-store";

// The gate derives the approval id from the tool call id, so the defaults keep
// that relationship (`approval-${toolCallId}`) rather than two unrelated ids.
const DEFAULT_TOOL_CALL_ID = "call-1";
const BASE_APPROVAL_REF: ToolApprovalDecisionRef = {
  workspaceId: "workspace-1",
  subjectId: "subject-1",
  conversationId: "conversation-1",
  turnId: "turn-1",
  runId: "run-1",
  approvalId: `approval-${DEFAULT_TOOL_CALL_ID}`,
  toolCallId: DEFAULT_TOOL_CALL_ID,
  toolName: "jira.create_issue",
  inputDigest: "sha256:digest",
};

const DEFAULT_REQUESTED_AT = "2026-07-12T12:00:00.000Z";
const DEFAULT_EXPIRES_AT = "2026-07-13T12:00:00.000Z";

/** The authorization identity that `findOwnedApproval` returns and a decision targets. */
export function toolApprovalRef(
  overrides: Partial<ToolApprovalDecisionRef> = {},
): ToolApprovalDecisionRef {
  return { ...BASE_APPROVAL_REF, ...overrides };
}

/** A durable approval row snapshot; defaults to the pre-decision `requested` state. */
export function toolApprovalSnapshot(
  overrides: Partial<ToolApprovalSnapshot> = {},
): ToolApprovalSnapshot {
  return {
    ...BASE_APPROVAL_REF,
    requestedAt: DEFAULT_REQUESTED_AT,
    expiresAt: DEFAULT_EXPIRES_AT,
    state: TOOL_APPROVAL_STATES.REQUESTED,
    ...overrides,
  };
}

/** A route-side decision outcome; defaults to a freshly accepted approval. */
export function toolApprovalDecisionResult(
  overrides: Partial<ToolApprovalDecisionResult> = {},
): ToolApprovalDecisionResult {
  return {
    disposition: TOOL_APPROVAL_DECISION_DISPOSITIONS.ACCEPTED,
    state: TOOL_APPROVAL_STATES.APPROVED,
    ...overrides,
  };
}

export type FakeToolApprovalDecisionStoreConfig = Readonly<{
  lookup?: ToolApprovalLookup;
  result?: ToolApprovalDecisionResult;
  findOwnedApproval?: ToolApprovalDecisionStore["findOwnedApproval"];
  decideApproval?: ToolApprovalDecisionStore["decideApproval"];
}>;

/**
 * A `ToolApprovalDecisionStore` fake. Pass `lookup`/`result` for the common
 * happy path, or a `findOwnedApproval`/`decideApproval` spy to assert on calls.
 */
export function fakeToolApprovalDecisionStore(
  config: FakeToolApprovalDecisionStoreConfig = {},
): ToolApprovalDecisionStore {
  return {
    findOwnedApproval: config.findOwnedApproval ?? (async () => config.lookup ?? toolApprovalRef()),
    decideApproval:
      config.decideApproval ?? (async () => config.result ?? toolApprovalDecisionResult()),
  };
}
