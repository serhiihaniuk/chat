import { type ReactElement } from "react";
import { FileText } from "lucide-react";

import type { RenderActivityItem } from "#entities/activity";
import { DEFAULT_TOOL_DETAIL_LEVEL, type ToolDetailLevel } from "#entities/settings";
import { parseFootnoteSources } from "#shared/ai/footnote-sources";
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
import { WorkflowActivityTrace } from "./activity/workflow-activity-trace.js";
import { WorkflowToolPresentation } from "./workflow-tool-presentation.js";
import { groupTimelineItems, type FileItem } from "./workflow-timeline-grouping.js";
import { WorkflowPendingTimeline } from "./workflow-pending-timeline.js";

export function WorkflowMessageTimeline({
  approvalDecisions,
  isStreaming = false,
  message,
  onApprovalDecision,
  onRetry,
  renderActivityItem,
  terminal,
  toolDetail = DEFAULT_TOOL_DETAIL_LEVEL,
}: {
  readonly isStreaming?: boolean;
  readonly message: WorkflowTimelineMessage;
  readonly onRetry?: (() => void) | undefined;
  readonly approvalDecisions?: WorkflowApprovalDecisions | undefined;
  readonly onApprovalDecision?: WorkflowApprovalDecisionHandler | undefined;
  readonly renderActivityItem?: RenderActivityItem | undefined;
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
        activityDurationMs={readActivityDuration(message)}
        approvalDecisions={approvalDecisions}
        isStreaming={isStreaming}
        items={projectWorkflowMessageParts(message, messageTerminal)}
        labels={labels}
        messageIsBlocked={messageTerminal?.kind === "blocked" && role === "assistant"}
        onApprovalDecision={onApprovalDecision}
        renderActivityItem={renderActivityItem}
        role={role}
        toolDetail={toolDetail}
      />
      {messageTerminal && <TerminalPresentation onRetry={onRetry} terminal={messageTerminal} />}
    </div>
  );
}

function readActivityDuration(message: WorkflowTimelineMessage): number | undefined {
  return message.metadata?.activityDurationMs;
}

function WorkflowMessageContent({
  messageIsBlocked,
  ...body
}: Parameters<typeof MessageBody>[0] & {
  readonly messageIsBlocked: boolean;
}): ReactElement {
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
  activityDurationMs,
  approvalDecisions,
  isStreaming,
  items,
  labels,
  onApprovalDecision,
  renderActivityItem,
  role,
  toolDetail,
}: {
  readonly activityDurationMs: number | undefined;
  readonly approvalDecisions: WorkflowApprovalDecisions | undefined;
  readonly isStreaming: boolean;
  readonly items: readonly WorkflowTimelineItem[];
  readonly labels: WidgetLabels;
  readonly onApprovalDecision: WorkflowApprovalDecisionHandler | undefined;
  readonly renderActivityItem: RenderActivityItem | undefined;
  readonly role: "user" | "assistant";
  readonly toolDetail: ToolDetailLevel;
}): ReactElement {
  const { answers, approvals, files, sources, trace } = groupTimelineItems(
    items,
    approvalDecisions,
    toolDetail,
    renderActivityItem,
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
  const answerText = answers.map((answer) => answer.text).join("");
  const footnoteSources = parseFootnoteSources(answerText);
  const visibleSources = footnoteSources.length > 0 ? footnoteSources : sources;
  const isEmpty =
    trace.length === 0 &&
    approvals.length === 0 &&
    answerText.length === 0 &&
    visibleSources.length === 0 &&
    files.length === 0;
  const isThinking = isStreaming && answerText.trim().length === 0;

  return (
    <>
      {trace.length > 0 && (
        <WorkflowActivityTrace
          activityDurationMs={activityDurationMs}
          isStreaming={isStreaming}
          items={trace}
          labels={labels}
          thinking={isThinking}
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
      {answerText.length > 0 && (
        <Message
          mode={isStreaming || answers.some((answer) => answer.streaming) ? "streaming" : "static"}
          role={role}
          text={answerText}
        />
      )}
      {visibleSources.length > 0 && <SourcesFold sources={visibleSources} />}
      {files.map((item) => (
        <FilePresentation item={item} key={item.id} />
      ))}
      <CompletedAnswerCopy answerText={answerText} isStreaming={isStreaming} role={role} />
      <EmptyAssistant isEmpty={isEmpty} isStreaming={isStreaming} role={role} />
    </>
  );
}

function EmptyAssistant({
  isEmpty,
  isStreaming,
  role,
}: {
  readonly isEmpty: boolean;
  readonly isStreaming: boolean;
  readonly role: "user" | "assistant";
}): ReactElement | null {
  if (!isEmpty || role !== "assistant") return null;
  if (isStreaming) return <WorkflowPendingTimeline />;
  return <Message mode="static" role="assistant" text="" />;
}

function CompletedAnswerCopy({
  answerText,
  isStreaming,
  role,
}: {
  readonly answerText: string;
  readonly isStreaming: boolean;
  readonly role: "user" | "assistant";
}): ReactElement | null {
  if (role !== "assistant" || isStreaming || answerText.length === 0) return null;
  return <MessageActions copyText={answerText} />;
}

function FilePresentation({ item }: { readonly item: FileItem }): ReactElement {
  if (item.mediaType.startsWith("image/") && item.url.startsWith("data:")) {
    return (
      <ActivityImages
        images={[
          {
            alt: item.filename ?? "Image",
            data: item.url,
            mediaType: item.mediaType,
          },
        ]}
      />
    );
  }
  return (
    <div
      data-slot="file-presentation"
      className="flex items-center gap-(--tool-detail-gap) rounded-md border border-border bg-muted p-(--tool-detail-pad)"
    >
      <FileText className="size-icon-sm shrink-0 text-muted-foreground" />
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
