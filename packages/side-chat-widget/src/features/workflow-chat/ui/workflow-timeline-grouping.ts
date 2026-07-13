import type { ReactElement } from "react";

import type { ToolDetailLevel } from "#entities/settings";
import type { CitationSource } from "#shared/ui/activity/citations";
import type { ReasoningItem } from "#shared/ui/reasoning";

import type { WorkflowTimelineItem } from "../model/native-message-projection.js";
import type { WorkflowApprovalDecisions } from "../model/use-workflow-widget-chat.js";
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
  renderTool: (item: ToolItem) => ReactElement,
): TimelineGroups {
  return {
    trace: collectTrace(items, approvalDecisions, toolDetail, renderTool),
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
  renderTool: (item: ToolItem) => ReactElement,
): ReasoningItem[] {
  const trace: ReasoningItem[] = [];
  for (const item of items) {
    if (item.kind === "reasoning") {
      trace.push({ kind: "thought", id: item.id, text: item.text });
    } else if (item.kind === "tool" && !usesApprovalCard(item, approvalDecisions)) {
      if (toolDetail === "hidden") continue;
      trace.push({ kind: "node", id: item.id, node: renderTool(item) });
    }
  }
  return trace;
}

function collectSources(items: readonly WorkflowTimelineItem[]): CitationSource[] {
  const sources: CitationSource[] = [];
  for (const item of items) {
    if (item.kind === "source") sources.push({ label: item.label, url: item.url });
  }
  return sources;
}
