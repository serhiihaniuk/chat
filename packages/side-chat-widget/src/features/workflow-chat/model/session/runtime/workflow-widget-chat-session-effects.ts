import { cancelWorkflowChatRun, normalizeWorkflowChatError } from "#entities/workflow-chat";
import type { WorkflowClientToolCall } from "../../client-tools/workflow-client-tool-dispatch.js";
import type { WorkflowWidgetChatEvent } from "../reducer/workflow-widget-chat-reducer.js";
import type { WorkflowWidgetChatSessionSnapshot } from "../workflow-widget-chat-session-contract.js";
import {
  decidePendingWorkflowApproval,
  dispatchPendingWorkflowClientTool,
} from "./workflow-widget-chat-interactions.js";
import type { WorkflowWidgetChatRuntimeContext } from "./workflow-widget-chat-session-helpers.js";

export type WorkflowWidgetChatSessionEffectContext = Readonly<{
  client: WorkflowWidgetChatRuntimeContext["client"];
  dispatch: (event: WorkflowWidgetChatEvent) => void;
  hostBridge: WorkflowWidgetChatRuntimeContext["hostBridge"];
  isDisposed: () => boolean;
  isEpochActive: () => boolean;
  readSnapshot: () => WorkflowWidgetChatSessionSnapshot;
  reconnect: (runId: string) => void;
}>;

type WorkflowWidgetApprovalInput = Readonly<{
  approvalId: string;
  approved: boolean;
}>;

export async function decideWorkflowWidgetApproval(
  context: WorkflowWidgetChatSessionEffectContext,
  input: WorkflowWidgetApprovalInput,
): Promise<void> {
  const continuation = await decidePendingWorkflowApproval({
    ...input,
    client: context.client,
    dispatch: context.dispatch,
    readSnapshot: context.readSnapshot,
  });
  if (!continuation?.reconnect || context.isDisposed()) return;
  context.reconnect(continuation.runId);
}

export async function dispatchWorkflowWidgetClientTool(
  context: WorkflowWidgetChatSessionEffectContext,
  toolCall: WorkflowClientToolCall,
): Promise<void> {
  const continuation = await dispatchPendingWorkflowClientTool({
    client: context.client,
    dispatch: context.dispatch,
    hostBridge: context.hostBridge,
    readSnapshot: context.readSnapshot,
    toolCall,
  });
  if (!continuation?.reconnect || context.isDisposed() || context.isEpochActive()) return;
  context.reconnect(continuation.runId);
}

export function requestWorkflowWidgetCancellation(
  context: WorkflowWidgetChatSessionEffectContext,
  runId: string,
): void {
  const snapshot = context.readSnapshot();
  if (
    context.isDisposed() ||
    !snapshot.cancelRequested ||
    snapshot.activeRunId !== runId ||
    snapshot.cancelDeliveryRunId === runId ||
    snapshot.terminal.kind !== "none"
  ) {
    return;
  }
  context.dispatch({ type: "CancelDeliveryStarted", runId });
  void cancelWorkflowChatRun(context.client, runId).catch((error) => {
    context.dispatch({
      type: "CancelDeliveryFailed",
      runId,
      error: normalizeWorkflowChatError(error),
    });
  });
}
