import { useState, type ReactElement } from "react";
import { FileText, ShieldCheck } from "lucide-react";
import { SIDE_CHAT_ERROR_VOCABULARY, SIDE_CHAT_ERROR_CODES } from "@side-chat/stream-profile";

import { useWidgetLabels, type WidgetLabels } from "#shared/lib/widget-labels";
import { ActivityImages } from "#shared/ui/activity/activity-images";
import { SourcesFold } from "#shared/ui/activity/citations";
import { ToolDetailRow, hasToolDetail, type ToolDetail } from "#shared/ui/activity/tool-detail";
import {
  BlockedNotice,
  CancelledNotice,
  ErrorNotice,
  TruncatedNotice,
} from "#shared/ui/error-notice";
import { Message } from "#shared/ui/message";
import { Reasoning } from "#shared/ui/reasoning";
import { ToolRow, type ToolState } from "#shared/ui/tool-row";

import {
  projectWorkflowMessageParts,
  type WorkflowTimelineItem,
  type WorkflowTimelineMessage,
  type WorkflowTimelineToolState,
} from "../model/native-message-projection.js";
import type { WorkflowChatTerminal } from "../model/use-workflow-widget-chat.js";

export function WorkflowMessageTimeline({
  isStreaming = false,
  message,
  onRetry,
  terminal,
}: {
  readonly isStreaming?: boolean;
  readonly message: WorkflowTimelineMessage;
  readonly onRetry?: (() => void) | undefined;
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
          role={message.role === "user" ? "user" : "assistant"}
        />
      )}
      {activeTerminal && <TerminalPresentation onRetry={onRetry} terminal={activeTerminal} />}
    </div>
  );
}

function TimelineItems({
  isStreaming,
  items,
  labels,
  role,
}: {
  readonly isStreaming: boolean;
  readonly items: readonly WorkflowTimelineItem[];
  readonly labels: WidgetLabels;
  readonly role: "user" | "assistant";
}): ReactElement {
  return (
    <>
      {items.length === 0 && role === "assistant" ? (
        <Message mode={isStreaming ? "streaming" : "static"} role="assistant" text="" />
      ) : null}
      {items.map((item) => (
        <TimelineItem isStreaming={isStreaming} item={item} key={item.id} labels={labels} />
      ))}
    </>
  );
}

function TimelineItem({
  isStreaming,
  item,
  labels,
}: {
  readonly isStreaming: boolean;
  readonly item: WorkflowTimelineItem;
  readonly labels: WidgetLabels;
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
  if (item.kind === "tool") return <ToolPresentation item={item} labels={labels} />;
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
      label={item.streaming ? labels.activityThinking : labels.activityThoughtProcess}
      thinking={item.streaming}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

function ToolPresentation({
  item,
  labels,
}: {
  readonly item: Extract<WorkflowTimelineItem, { kind: "tool" }>;
  readonly labels: WidgetLabels;
}): ReactElement {
  if (item.state === "approval-requested") {
    return (
      <div
        data-slot="tool-approval"
        role="status"
        className="flex items-start gap-(--tool-detail-gap) rounded-md border border-border bg-muted p-(--tool-detail-pad)"
      >
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col gap-(--tool-detail-gap)">
          <span className="text-sm font-medium text-foreground">{item.name}</span>
          <span className="text-xs text-muted-foreground">{labels.activityApprovalRequired}</span>
        </div>
      </div>
    );
  }

  const state = toolStateFor(item.state);
  const detail = toolDetailFor(item);
  return hasToolDetail(detail) ? (
    <ToolDetailRow detail={detail} name={item.name} state={state} />
  ) : (
    <ToolRow name={item.name} state={state} />
  );
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

function FilePresentation({
  item,
}: {
  readonly item: Extract<WorkflowTimelineItem, { kind: "file" }>;
}): ReactElement {
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

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return Object.fromEntries(Object.entries(value));
}
