import type { ReactElement } from "react";

import type { RenderActivityItem } from "#entities/activity";
import type { ToolDetailLevel } from "#entities/settings";
import type { CitationSource } from "#shared/ui/activity/citations";
import type { ReasoningItem } from "#shared/ui/reasoning";

import type { WorkflowTimelineItem } from "../model/native-message-projection.js";
import type { WorkflowApprovalDecisions } from "../model/use-workflow-widget-chat.js";
import { toWorkflowSideChatActivityItem } from "./activity/workflow-activity-item.js";
import { usesApprovalCard } from "./workflow-tool-presentation.js";

export type ToolItem = Extract<WorkflowTimelineItem, { kind: "tool" }>;
export type TextItem = Extract<WorkflowTimelineItem, { kind: "text" }>;
export type FileItem = Extract<WorkflowTimelineItem, { kind: "file" }>;

export type TimelineGroups = Readonly<{
  trace: readonly ReasoningItem[];
  approvals: readonly ToolItem[];
  answers: readonly TextItem[];
  sources: readonly CitationSource[];
  files: readonly FileItem[];
}>;

const isTextItem = (item: WorkflowTimelineItem): item is TextItem => item.kind === "text";
const isFileItem = (item: WorkflowTimelineItem): item is FileItem => item.kind === "file";

// Sort native parts into the legacy layout: one activity trace (reasoning plus
// non-approval tool rows), interactive approval cards, answers, sources, and files.
export function groupTimelineItems(
  items: readonly WorkflowTimelineItem[],
  approvalDecisions: WorkflowApprovalDecisions | undefined,
  toolDetail: ToolDetailLevel,
  renderActivityItem: RenderActivityItem | undefined,
  renderTool: (item: ToolItem) => ReactElement,
): TimelineGroups {
  return {
    trace: collectTrace(items, approvalDecisions, toolDetail, renderActivityItem, renderTool),
    approvals: items.filter(
      (item): item is ToolItem => item.kind === "tool" && usesApprovalCard(item, approvalDecisions),
    ),
    answers: items.filter(isTextItem),
    sources: collectSources(items),
    files: items.filter(isFileItem),
  };
}

// Reasoning thoughts and non-approval tool rows, kept in source order. At tool
// detail "hidden" the tool rows drop out and only the thoughts remain.
function collectTrace(
  items: readonly WorkflowTimelineItem[],
  approvalDecisions: WorkflowApprovalDecisions | undefined,
  toolDetail: ToolDetailLevel,
  renderActivityItem: RenderActivityItem | undefined,
  renderTool: (item: ToolItem) => ReactElement,
): ReasoningItem[] {
  const trace: ReasoningItem[] = [];
  for (const item of items) {
    const traceItem = toTraceItem(
      item,
      approvalDecisions,
      toolDetail,
      renderActivityItem,
      renderTool,
    );
    if (traceItem) trace.push(traceItem);
  }
  return trace;
}

function toTraceItem(
  item: WorkflowTimelineItem,
  approvalDecisions: WorkflowApprovalDecisions | undefined,
  toolDetail: ToolDetailLevel,
  renderActivityItem: RenderActivityItem | undefined,
  renderTool: (item: ToolItem) => ReactElement,
): ReasoningItem | undefined {
  if (item.kind === "reasoning") return toReasoningTraceItem(item, renderActivityItem);
  if (item.kind !== "tool") return undefined;
  return toToolTraceItem(item, approvalDecisions, toolDetail, renderActivityItem, renderTool);
}

function toReasoningTraceItem(
  item: Extract<WorkflowTimelineItem, { kind: "reasoning" }>,
  renderActivityItem: RenderActivityItem | undefined,
): ReasoningItem {
  const custom = renderActivityItem?.(toWorkflowSideChatActivityItem(item));
  return custom === undefined
    ? { kind: "thought", id: item.id, text: item.text }
    : { kind: "node", id: item.id, node: custom };
}

function toToolTraceItem(
  item: ToolItem,
  approvalDecisions: WorkflowApprovalDecisions | undefined,
  toolDetail: ToolDetailLevel,
  renderActivityItem: RenderActivityItem | undefined,
  renderTool: (item: ToolItem) => ReactElement,
): ReasoningItem | undefined {
  if (usesApprovalCard(item, approvalDecisions) || toolDetail === "hidden") return undefined;
  const custom =
    toolDetail === "full" ? renderActivityItem?.(toWorkflowSideChatActivityItem(item)) : undefined;
  return {
    kind: "node",
    id: item.id,
    node: custom === undefined ? renderTool(item) : custom,
  };
}

function collectSources(items: readonly WorkflowTimelineItem[]): CitationSource[] {
  const sources: CitationSource[] = [];
  for (const item of items) {
    if (item.kind === "source") sources.push({ label: item.label, url: item.url });
  }
  return sources;
}
