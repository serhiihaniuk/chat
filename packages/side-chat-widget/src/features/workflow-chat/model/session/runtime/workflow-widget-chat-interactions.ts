import { resolveWorkflowApprovalDecision } from "../../approval/workflow-approval.js";
import {
  dispatchWorkflowClientTool,
  type WorkflowClientToolCall,
} from "../../client-tools/workflow-client-tool-dispatch.js";
import type { WorkflowWidgetChatEvent } from "../reducer/workflow-widget-chat-reducer.js";
import type { WorkflowWidgetChatSessionSnapshot } from "../workflow-widget-chat-session-contract.js";
import type { WorkflowWidgetChatRuntimeContext } from "./workflow-widget-chat-session-helpers.js";

type WorkflowWidgetInteractionState = Readonly<{
  dispatch: (event: WorkflowWidgetChatEvent) => void;
  readSnapshot: () => WorkflowWidgetChatSessionSnapshot;
}>;

type WorkflowWidgetClientToolContext = Pick<
  WorkflowWidgetChatRuntimeContext,
  "client" | "hostBridge"
>;

export type WorkflowWidgetInteractionContinuation = Readonly<{
  reconnect: boolean;
  runId: string;
}>;

export async function decidePendingWorkflowApproval(
  input: WorkflowWidgetInteractionState &
    Pick<WorkflowWidgetChatRuntimeContext, "client"> &
    Readonly<{ approvalId: string; approved: boolean }>,
): Promise<WorkflowWidgetInteractionContinuation | undefined> {
  const initial = input.readSnapshot();
  const runId = initial.activeRunId;
  if (!runId || !initial.pending.approvalIds.has(input.approvalId)) return undefined;
  input.dispatch({
    type: "ApprovalRequestStarted",
    approvalId: input.approvalId,
    decision: input.approved ? "approved" : "denied",
  });
  if (!input.readSnapshot().pending.approvalRequestsInFlight.has(input.approvalId)) {
    return undefined;
  }
  const decision = await resolveWorkflowApprovalDecision({
    approvalId: input.approvalId,
    approved: input.approved,
    client: input.client,
    runId,
  });
  if (input.readSnapshot().activeRunId !== runId) return undefined;
  input.dispatch({
    type: "ApprovalDecisionRecorded",
    approvalId: input.approvalId,
    decision,
  });
  return { reconnect: decision === "approved" || decision === "denied", runId };
}

export async function dispatchPendingWorkflowClientTool(
  input: WorkflowWidgetInteractionState &
    WorkflowWidgetClientToolContext &
    Readonly<{ toolCall: WorkflowClientToolCall }>,
): Promise<WorkflowWidgetInteractionContinuation | undefined> {
  const runId = input.readSnapshot().activeRunId;
  if (!runId) {
    input.dispatch({ type: "ClientToolSettled", toolCallId: input.toolCall.toolCallId });
    return undefined;
  }
  const pending = input.readSnapshot().pending;
  if (
    !pending.clientToolCallIds.has(input.toolCall.toolCallId) ||
    pending.claimedClientToolCallIds.has(input.toolCall.toolCallId) ||
    pending.handledClientToolCallIds.has(input.toolCall.toolCallId)
  ) {
    return undefined;
  }
  input.dispatch({ type: "ClientToolClaimed", toolCallId: input.toolCall.toolCallId });
  if (!input.readSnapshot().pending.claimedClientToolCallIds.has(input.toolCall.toolCallId)) {
    return undefined;
  }
  const outcome = await dispatchWorkflowClientTool({
    client: input.client,
    hostBridge: input.hostBridge,
    runId,
    toolCall: input.toolCall,
  });
  if (input.readSnapshot().activeRunId !== runId) return undefined;
  input.dispatch({ type: "ClientToolSettled", toolCallId: input.toolCall.toolCallId });
  return { reconnect: outcome.outputPosted, runId };
}
