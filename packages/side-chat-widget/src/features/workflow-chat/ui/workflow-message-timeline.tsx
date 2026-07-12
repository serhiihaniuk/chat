import { useState, type ReactElement } from "react";
import { FileText } from "lucide-react";

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
import { Reasoning } from "#shared/ui/reasoning";

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
  const items = projectWorkflowMessageParts(message, messageTerminal);
  const activeTerminal = messageTerminal;

  return (
    <div
      data-slot="workflow-message-timeline"
      className="flex w-full flex-col gap-(--message-stack-gap)"
    >
      {messageTerminal?.kind === "blocked" && message.role === "assistant" ? (
        <BlockedNotice message={labels.noticeBlocked} />
      ) : (
        <TimelineItems
          isStreaming={isStreaming}
          items={items}
          labels={labels}
          approvalDecisions={approvalDecisions}
          onApprovalDecision={onApprovalDecision}
          role={message.role === "user" ? "user" : "assistant"}
        />
      )}
      {activeTerminal && (
        <TerminalPresentation onRetry={onRetry} terminal={activeTerminal} />
      )}
    </div>
  );
}

function TimelineItems({
  approvalDecisions,
  isStreaming,
  items,
  labels,
  onApprovalDecision,
  role,
}: {
  readonly isStreaming: boolean;
  readonly items: readonly WorkflowTimelineItem[];
  readonly labels: WidgetLabels;
  readonly approvalDecisions: WorkflowApprovalDecisions | undefined;
  readonly onApprovalDecision: WorkflowApprovalDecisionHandler | undefined;
  readonly role: "user" | "assistant";
}): ReactElement {
  return (
    <>
      {items.length === 0 && role === "assistant" ? (
        <Message
          mode={isStreaming ? "streaming" : "static"}
          role="assistant"
          text=""
        />
      ) : null}
      {items.map((item) => (
        <TimelineItem
          approvalDecisions={approvalDecisions}
          isStreaming={isStreaming}
          item={item}
          key={item.id}
          labels={labels}
          onApprovalDecision={onApprovalDecision}
        />
      ))}
    </>
  );
}

function TimelineItem({
  approvalDecisions,
  isStreaming,
  item,
  labels,
  onApprovalDecision,
}: {
  readonly isStreaming: boolean;
  readonly item: WorkflowTimelineItem;
  readonly labels: WidgetLabels;
  readonly approvalDecisions: WorkflowApprovalDecisions | undefined;
  readonly onApprovalDecision: WorkflowApprovalDecisionHandler | undefined;
}): ReactElement {
  if (item.kind === "text") {
    return (
      <Message
        mode={isStreaming || item.streaming ? "streaming" : "static"}
        role={item.role}
        text={item.text}
      />
    );
  }
  if (item.kind === "reasoning") {
    return <WorkflowReasoningPresentation item={item} labels={labels} />;
  }
  if (item.kind === "tool") {
    return (
      <WorkflowToolPresentation
        approvalDecisions={approvalDecisions}
        item={item}
        labels={labels}
        onApprovalDecision={onApprovalDecision}
      />
    );
  }
  if (item.kind === "source") {
    return <SourcesFold sources={[{ label: item.label, url: item.url }]} />;
  }
  return <FilePresentation item={item} />;
}

function WorkflowReasoningPresentation({
  item,
  labels,
}: {
  readonly item: Extract<WorkflowTimelineItem, { kind: "reasoning" }>;
  readonly labels: WidgetLabels;
}): ReactElement {
  const [open, setOpen] = useState(item.streaming);
  return (
    <Reasoning
      items={[{ kind: "thought", id: item.id, text: item.text }]}
      label={
        item.streaming ? labels.activityThinking : labels.activityThoughtProcess
      }
      thinking={item.streaming}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

function FilePresentation({
  item,
}: {
  readonly item: Extract<WorkflowTimelineItem, { kind: "file" }>;
}): ReactElement {
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
  if (terminal.kind === "cancelled") {
    return <CancelledNotice message={labels.noticeCancelled} />;
  }
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
