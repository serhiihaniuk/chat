import { useState, type ReactElement } from "react";
import { ShieldCheck } from "lucide-react";
import { SIDE_CHAT_ERROR_CODES, SIDE_CHAT_ERROR_VOCABULARY } from "@side-chat/stream-profile";
import { asRecord } from "@side-chat/shared";

import { DEFAULT_TOOL_DETAIL_LEVEL, type ToolDetailLevel } from "#entities/settings";
import { Button } from "#shared/ui/button";
import { ToolDetailRow, hasToolDetail, type ToolDetail } from "#shared/ui/activity/tool-detail";
import { ToolRow, type ToolState } from "#shared/ui/tool-row";
import type { WidgetLabels } from "#shared/lib/widget-labels";

import type {
  WorkflowApprovalDecisionHandler,
  WorkflowApprovalDecisions,
  WorkflowApprovalDecisionState,
} from "../model/use-workflow-widget-chat.js";
import type {
  WorkflowTimelineItem,
  WorkflowTimelineToolState,
} from "../model/native-message-projection.js";

/** The approval card's own state: a pending request plus the decided outcomes. */
type ApprovalCardDecision = "requested" | WorkflowApprovalDecisionState;

export function WorkflowToolPresentation({
  approvalDecisions,
  item,
  labels,
  onApprovalDecision,
  toolDetail = DEFAULT_TOOL_DETAIL_LEVEL,
}: {
  readonly approvalDecisions: WorkflowApprovalDecisions | undefined;
  readonly item: Extract<WorkflowTimelineItem, { kind: "tool" }>;
  readonly labels: WidgetLabels;
  readonly onApprovalDecision: WorkflowApprovalDecisionHandler | undefined;
  readonly toolDetail?: ToolDetailLevel | undefined;
}): ReactElement {
  const decision = approvalCardDecision(item, approvalDecisions);
  if (decision) {
    return (
      <ApprovalPresentation
        decision={decision}
        item={item}
        labels={labels}
        onApprovalDecision={onApprovalDecision}
      />
    );
  }

  // "name" pins the compact row (no payload disclosure); "full" reaches the
  // expandable detail row when the call carries input/result. "hidden" never
  // reaches here — the trace drops those tools before rendering.
  const state = toolStateFor(item.state);
  const detail = toolDetail === "full" ? toolDetailFor(item) : {};
  return hasToolDetail(detail) ? (
    <ToolDetailRow detail={detail} name={item.name} state={state} />
  ) : (
    <ToolRow name={item.name} state={state} />
  );
}

function approvalDecisionForToolState(state: WorkflowTimelineToolState): "requested" | undefined {
  return state === "approval-requested" ? "requested" : undefined;
}

/** The approval-card decision for a tool item, or undefined when it renders as a plain trace row. */
function approvalCardDecision(
  item: Extract<WorkflowTimelineItem, { kind: "tool" }>,
  approvalDecisions: WorkflowApprovalDecisions | undefined,
): ApprovalCardDecision | undefined {
  const approval = item.approval;
  const decision = approval
    ? (approvalDecisions?.[approval.id] ?? approval.state)
    : approvalDecisionForToolState(item.state);
  if (decision === "approved") return undefined;
  if (
    decision &&
    (item.state === "approval-requested" ||
      item.state === "input-available" ||
      item.state === "output-denied")
  ) {
    return decision;
  }
  return undefined;
}

/** Whether a tool item is an interactive approval card (rendered on its own, not folded into the trace). */
export function usesApprovalCard(
  item: Extract<WorkflowTimelineItem, { kind: "tool" }>,
  approvalDecisions: WorkflowApprovalDecisions | undefined,
): boolean {
  return approvalCardDecision(item, approvalDecisions) !== undefined;
}

function ApprovalPresentation({
  decision,
  item,
  labels,
  onApprovalDecision,
}: {
  readonly decision: ApprovalCardDecision;
  readonly item: Extract<WorkflowTimelineItem, { kind: "tool" }>;
  readonly labels: WidgetLabels;
  readonly onApprovalDecision: WorkflowApprovalDecisionHandler | undefined;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const approvalId = item.approval?.id;
  const canDecide = Boolean(decision === "requested" && approvalId && onApprovalDecision);
  const runDecision = (approved: boolean): void => {
    if (!canDecide || !approvalId || !onApprovalDecision) return;
    setBusy(true);
    void onApprovalDecision(approvalId, approved).finally(() => setBusy(false));
  };

  return (
    <div
      data-slot="tool-approval"
      data-state={decision}
      role="status"
      className="flex items-start gap-(--tool-detail-gap) rounded-md border border-border bg-muted p-(--tool-detail-pad)"
    >
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col gap-(--tool-detail-gap)">
        <span className="text-sm font-medium text-foreground">{item.name}</span>
        <span className="text-xs text-muted-foreground">{approvalCopy(decision, labels)}</span>
        {approvalId ? (
          <>
            <div className="flex flex-wrap gap-(--tool-detail-gap)">
              <Button disabled={!canDecide || busy} onClick={() => runDecision(true)} size="sm">
                {labels.approvalApprove}
              </Button>
              <Button
                disabled={!canDecide || busy}
                onClick={() => runDecision(false)}
                size="sm"
                variant="secondary"
              >
                {labels.approvalDeny}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function approvalCopy(decision: ApprovalCardDecision, labels: WidgetLabels): string {
  if (decision === "requested") return labels.activityApprovalRequired;
  if (decision === "approved") return labels.approvalApproved;
  if (decision === "denied") return labels.approvalDenied;
  if (decision === "expired") return labels.approvalExpired;
  return labels.approvalUnavailable;
}

function toolStateFor(state: WorkflowTimelineToolState): ToolState {
  if (state === "output-available") return "success";
  if (state === "output-error") return "error";
  if (state === "output-denied") return "denied";
  return "running";
}

function toolDetailFor(item: Extract<WorkflowTimelineItem, { kind: "tool" }>): ToolDetail {
  const input = asRecord(item.input);
  const output = asRecord(item.output);
  return {
    input,
    result: output,
    errorCode:
      item.state === "output-error"
        ? SIDE_CHAT_ERROR_VOCABULARY[SIDE_CHAT_ERROR_CODES.TOOL_FAILED].safeMessage
        : undefined,
  };
}
