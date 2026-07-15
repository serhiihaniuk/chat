import type { WorkflowActiveTurn } from "#entities/workflow-chat";
import { WORKFLOW_WIDGET_TRANSPORT } from "../reducer/workflow-widget-chat-reducer.js";
import type { WorkflowWidgetChatSessionSnapshot } from "../workflow-widget-chat-session-contract.js";

/** Keep an attachment only while the same run remains live and reachable. */
export function shouldKeepWorkflowWidgetEpoch(
  activeTurn: WorkflowActiveTurn | undefined,
  previous: WorkflowWidgetChatSessionSnapshot,
): boolean {
  return (
    activeTurn?.runId === previous.activeRunId &&
    previous.activeEpoch !== undefined &&
    previous.transport !== WORKFLOW_WIDGET_TRANSPORT.LOST
  );
}
