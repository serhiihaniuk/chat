import { useEffect, useState, type ReactElement } from "react";
import { FileText } from "lucide-react";

import {
  DEFAULT_REASONING_VISIBILITY,
  DEFAULT_TOOL_DETAIL_LEVEL,
  type ReasoningVisibility,
  type ToolDetailLevel,
} from "#entities/settings";
import { useWidgetLabels, type WidgetLabels } from "#shared/lib/widget-labels";
import { ActivityImages } from "#shared/ui/activity/activity-images";
import { SourcesFold } from "#shared/ui/activity/citations";
import {
  BlockedNotice,
  CancelledNotice,
  ErrorNotice,
  TruncatedNotice,
} from "#shared/ui/error-notice";
import { Message } from "#shared/ui/message";
import { MessageActions } from "#shared/ui/message-actions";
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
import { WorkflowToolPresentation } from "./workflow-tool-presentation.js";
import { groupTimelineItems, type FileItem } from "./workflow-timeline-grouping.js";

export function WorkflowMessageTimeline({
  approvalDecisions,
  isStreaming = false,
  message,
  onApprovalDecision,
  onRetry,
  reasoningVisibility = DEFAULT_REASONING_VISIBILITY,
  terminal,
  toolDetail = DEFAULT_TOOL_DETAIL_LEVEL,
}: {
  readonly isStreaming?: boolean;
  readonly message: WorkflowTimelineMessage;
  readonly onRetry?: (() => void) | undefined;
  readonly approvalDecisions?: WorkflowApprovalDecisions | undefined;
  readonly onApprovalDecision?: WorkflowApprovalDecisionHandler | undefined;
  readonly reasoningVisibility?: ReasoningVisibility | undefined;
  readonly terminal?: WorkflowChatTerminal | undefined;
  readonly toolDetail?: ToolDetailLevel | undefined;
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
      <WorkflowMessageContent
        approvalDecisions={approvalDecisions}
        isStreaming={isStreaming}
        items={projectWorkflowMessageParts(message, messageTerminal)}
        labels={labels}
        messageIsBlocked={messageTerminal?.kind === "blocked" && role === "assistant"}
        onApprovalDecision={onApprovalDecision}
        reasoningVisibility={reasoningVisibility}
        role={role}
        toolDetail={toolDetail}
      />
      {messageTerminal && <TerminalPresentation onRetry={onRetry} terminal={messageTerminal} />}
    </div>
  );
}

function WorkflowMessageContent({
  messageIsBlocked,
  ...body
}: Parameters<typeof MessageBody>[0] & { readonly messageIsBlocked: boolean }): ReactElement {
  return messageIsBlocked ? (
    <BlockedNotice message={body.labels.noticeBlocked} />
  ) : (
    <MessageBody {...body} />
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
  reasoningVisibility,
  role,
  toolDetail,
}: {
  readonly approvalDecisions: WorkflowApprovalDecisions | undefined;
  readonly isStreaming: boolean;
  readonly items: readonly WorkflowTimelineItem[];
  readonly labels: WidgetLabels;
  readonly onApprovalDecision: WorkflowApprovalDecisionHandler | undefined;
  readonly reasoningVisibility: ReasoningVisibility;
  readonly role: "user" | "assistant";
  readonly toolDetail: ToolDetailLevel;
}): ReactElement {
  const { answers, approvals, files, sources, trace } = groupTimelineItems(
    items,
    approvalDecisions,
    toolDetail,
    (item) => (
      <WorkflowToolPresentation
        approvalDecisions={approvalDecisions}
        item={item}
        labels={labels}
        onApprovalDecision={onApprovalDecision}
        toolDetail={toolDetail}
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
          reasoningVisibility={reasoningVisibility}
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
      <CompletedAnswerCopy answers={answers} isStreaming={isStreaming} role={role} />
      {isEmpty && role === "assistant" ? (
        <Message mode={isStreaming ? "streaming" : "static"} role="assistant" text="" />
      ) : null}
    </>
  );
}

function CompletedAnswerCopy({
  answers,
  isStreaming,
  role,
}: {
  readonly answers: readonly Extract<WorkflowTimelineItem, { kind: "text" }>[];
  readonly isStreaming: boolean;
  readonly role: "user" | "assistant";
}): ReactElement | null {
  if (role !== "assistant" || isStreaming || answers.length === 0) return null;
  return <MessageActions copyText={answers.map((item) => item.text).join("")} />;
}

// One "Thought process" fold for the whole trace: open while thinking, collapsed
// once the answer lands, matching the legacy view's activity timeline. Reasoning
// visibility "detailed" keeps a completed trace open instead of collapsing it.
function ActivityTrace({
  hasAnswer,
  isStreaming,
  items,
  labels,
  reasoningVisibility,
}: {
  readonly hasAnswer: boolean;
  readonly isStreaming: boolean;
  readonly items: readonly ReasoningItem[];
  readonly labels: WidgetLabels;
  readonly reasoningVisibility: ReasoningVisibility;
}): ReactElement {
  const openByDefault = isStreaming || reasoningVisibility === "detailed";
  const [open, setOpen] = useState(openByDefault);
  useEffect(() => {
    if (openByDefault) setOpen(true);
    else if (hasAnswer) setOpen(false);
  }, [hasAnswer, openByDefault]);
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
