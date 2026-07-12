import { useEffect, useState, type ReactElement } from "react";
import { FileText } from "lucide-react";

import { useWidgetLabels, type WidgetLabels } from "#shared/lib/widget-labels";
import { ActivityImages } from "#shared/ui/activity/activity-images";
import { SourcesFold, type CitationSource } from "#shared/ui/activity/citations";
import {
  BlockedNotice,
  CancelledNotice,
  ErrorNotice,
  TruncatedNotice,
} from "#shared/ui/error-notice";
import { Message } from "#shared/ui/message";
import { Reasoning, type ReasoningItem } from "#shared/ui/reasoning";

import {
  projectWorkflowMessageParts,
  type WorkflowTimelineItem,
  type WorkflowTimelineMessage,
} from "../model/native-message-projection.js";
import type {
  WorkflowApprovalDecisionHandler,
  WorkflowApprovalDecisions,
  WorkflowChatTerminal,
} from "../model/use-workflow-widget-chat.js";
import { usesApprovalCard, WorkflowToolPresentation } from "./workflow-tool-presentation.js";

type ToolItem = Extract<WorkflowTimelineItem, { kind: "tool" }>;
type TextItem = Extract<WorkflowTimelineItem, { kind: "text" }>;
type FileItem = Extract<WorkflowTimelineItem, { kind: "file" }>;

export function WorkflowMessageTimeline({
  approvalDecisions,
  isStreaming = false,
  message,
  onApprovalDecision,
  onRetry,
  terminal,
}: {
  readonly isStreaming?: boolean;
  readonly message: WorkflowTimelineMessage;
  readonly onRetry?: (() => void) | undefined;
  readonly approvalDecisions?: WorkflowApprovalDecisions | undefined;
  readonly onApprovalDecision?: WorkflowApprovalDecisionHandler | undefined;
  readonly terminal?: WorkflowChatTerminal | undefined;
}): ReactElement {
  const labels = useWidgetLabels();
  const messageTerminal =
    terminal &&
    terminal.kind !== "none" &&
    (terminal.messageId === undefined || terminal.messageId === message.id)
      ? terminal
      : undefined;
  const role = message.role === "user" ? "user" : "assistant";

  return (
    <div
      data-slot="workflow-message-timeline"
      className="flex w-full flex-col gap-(--message-stack-gap)"
    >
      {messageTerminal?.kind === "blocked" && role === "assistant" ? (
        <BlockedNotice message={labels.noticeBlocked} />
      ) : (
        <MessageBody
          approvalDecisions={approvalDecisions}
          isStreaming={isStreaming}
          items={projectWorkflowMessageParts(message, messageTerminal)}
          labels={labels}
          onApprovalDecision={onApprovalDecision}
          role={role}
        />
      )}
      {messageTerminal && <TerminalPresentation onRetry={onRetry} terminal={messageTerminal} />}
    </div>
  );
}

/**
 * Reasoning and tool activity fold into one collapsible trace, then the answer,
 * its sources, and any files — the same composition the legacy message view uses,
 * so the native branch reads identically without new layout. A tool awaiting a
 * decision stays on its own as the interactive approval card.
 */
function MessageBody({
  approvalDecisions,
  isStreaming,
  items,
  labels,
  onApprovalDecision,
  role,
}: {
  readonly approvalDecisions: WorkflowApprovalDecisions | undefined;
  readonly isStreaming: boolean;
  readonly items: readonly WorkflowTimelineItem[];
  readonly labels: WidgetLabels;
  readonly onApprovalDecision: WorkflowApprovalDecisionHandler | undefined;
  readonly role: "user" | "assistant";
}): ReactElement {
  const { answers, approvals, files, sources, trace } = groupTimelineItems(
    items,
    approvalDecisions,
    (item) => (
      <WorkflowToolPresentation
        approvalDecisions={approvalDecisions}
        item={item}
        labels={labels}
        onApprovalDecision={onApprovalDecision}
      />
    ),
  );
  const isEmpty =
    trace.length === 0 &&
    approvals.length === 0 &&
    answers.length === 0 &&
    sources.length === 0 &&
    files.length === 0;

  return (
    <>
      {trace.length > 0 && (
        <ActivityTrace
          hasAnswer={answers.length > 0}
          isStreaming={isStreaming}
          items={trace}
          labels={labels}
        />
      )}
      {approvals.map((item) => (
        <WorkflowToolPresentation
          approvalDecisions={approvalDecisions}
          item={item}
          key={item.id}
          labels={labels}
          onApprovalDecision={onApprovalDecision}
        />
      ))}
      {answers.map((item) => (
        <Message
          key={item.id}
          mode={isStreaming || item.streaming ? "streaming" : "static"}
          role={item.role}
          text={item.text}
        />
      ))}
      {sources.length > 0 && <SourcesFold sources={sources} />}
      {files.map((item) => (
        <FilePresentation item={item} key={item.id} />
      ))}
      {isEmpty && role === "assistant" ? (
        <Message mode={isStreaming ? "streaming" : "static"} role="assistant" text="" />
      ) : null}
    </>
  );
}

type TimelineGroups = Readonly<{
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
function groupTimelineItems(
  items: readonly WorkflowTimelineItem[],
  approvalDecisions: WorkflowApprovalDecisions | undefined,
  renderTool: (item: ToolItem) => ReactElement,
): TimelineGroups {
  return {
    trace: collectTrace(items, approvalDecisions, renderTool),
    approvals: items.filter(
      (item): item is ToolItem => item.kind === "tool" && usesApprovalCard(item, approvalDecisions),
    ),
    answers: items.filter(isTextItem),
    sources: collectSources(items),
    files: items.filter(isFileItem),
  };
}

// Reasoning thoughts and non-approval tool rows, kept in source order.
function collectTrace(
  items: readonly WorkflowTimelineItem[],
  approvalDecisions: WorkflowApprovalDecisions | undefined,
  renderTool: (item: ToolItem) => ReactElement,
): ReasoningItem[] {
  const trace: ReasoningItem[] = [];
  for (const item of items) {
    if (item.kind === "reasoning") {
      trace.push({ kind: "thought", id: item.id, text: item.text });
    } else if (item.kind === "tool" && !usesApprovalCard(item, approvalDecisions)) {
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

// One "Thought process" fold for the whole trace: open while thinking, collapsed
// once the answer lands, matching the legacy view's activity timeline.
function ActivityTrace({
  hasAnswer,
  isStreaming,
  items,
  labels,
}: {
  readonly hasAnswer: boolean;
  readonly isStreaming: boolean;
  readonly items: readonly ReasoningItem[];
  readonly labels: WidgetLabels;
}): ReactElement {
  const [open, setOpen] = useState(isStreaming);
  useEffect(() => {
    if (!isStreaming && hasAnswer) setOpen(false);
  }, [hasAnswer, isStreaming]);
  return (
    <Reasoning
      items={items}
      label={isStreaming ? labels.activityThinking : labels.activityThoughtProcess}
      onOpenChange={setOpen}
      open={open}
      thinking={isStreaming}
    />
  );
}

function FilePresentation({ item }: { readonly item: FileItem }): ReactElement {
  if (item.mediaType.startsWith("image/") && item.url.startsWith("data:")) {
    return (
      <ActivityImages
        images={[{ alt: item.filename ?? "Image", data: item.url, mediaType: item.mediaType }]}
      />
    );
  }
  return (
    <div
      data-slot="file-presentation"
      className="flex items-center gap-(--tool-detail-gap) rounded-md border border-border bg-muted p-(--tool-detail-pad)"
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate text-sm text-foreground">
        {item.filename ?? item.mediaType}
      </span>
    </div>
  );
}

function TerminalPresentation({
  onRetry,
  terminal,
}: {
  readonly onRetry: (() => void) | undefined;
  readonly terminal: Exclude<WorkflowChatTerminal, { kind: "none" }>;
}): ReactElement | null {
  const labels = useWidgetLabels();
  if (terminal.kind === "blocked") return null;
  if (terminal.kind === "cancelled") return <CancelledNotice message={labels.noticeCancelled} />;
  if (terminal.kind === "completed") {
    return terminal.finishReason === "length" ? (
      <TruncatedNotice message={labels.noticeTruncated} />
    ) : null;
  }
  if (terminal.retryable && onRetry) {
    return <ErrorNotice message={terminal.message} onRetry={onRetry} />;
  }
  return <ErrorNotice message={terminal.message} />;
}
