import { memo, useEffect, useMemo, useState } from "react";

import type { RenderActivityItem } from "#entities/activity";
import type { WidgetMessage } from "#entities/chat";
import { DEFAULT_TOOL_DETAIL_LEVEL, type ToolDetailLevel } from "#entities/settings";
import { parseFootnoteSources } from "#shared/ai/footnote-sources";
import { MarkdownContent } from "#shared/ai/markdown-content";
import { useWidgetLabels, type WidgetLabels } from "#shared/lib/widget-labels";
import { ActivityImages } from "#shared/ui/activity/activity-images";
import { SourcesFold } from "#shared/ui/activity/citations";
import { Message } from "#shared/ui/message";
import { MessageActions } from "#shared/ui/message-actions";
import { Reasoning, type ReasoningItem } from "#shared/ui/reasoning";
import {
  readMessageImages,
  readMessageSources,
  toReasoningItems,
} from "./activity/widget-activity-content.js";

// Wrapped in memo so a streaming token only re-renders the message that actually
// changed, not every message in the list. This works because updating a message
// builds a new array but keeps the exact same object for every unchanged message.
export const WidgetMessageView = memo(
  ({
    message,
    renderActivityItem,
    toolDetail = DEFAULT_TOOL_DETAIL_LEVEL,
  }: {
    readonly message: WidgetMessage;
    readonly renderActivityItem?: RenderActivityItem | undefined;
    readonly toolDetail?: ToolDetailLevel | undefined;
  }) => {
    const showActivity = shouldShowActivity(message);
    const mode = message.isStreaming === true ? "streaming" : "static";
    const images = readMessageImages(message);
    // One "N sources" fold under the answer, spaced by this view's flex gap like
    // reasoning and the answer. The model's explicit footnote citations are the
    // curated surface when present (their numbers match the inline chips); a pure
    // tool turn falls back to the tool-attributed sources.
    const footnoteSources = parseFootnoteSources(message.content);
    const sources = footnoteSources.length > 0 ? footnoteSources : readMessageSources(message);

    return (
      // One density-driven token (--message-stack-gap) spaces every part of the
      // message — reasoning, answer, sources fold — so their vertical rhythm stays
      // consistent and scales with the Density control.
      <div className="flex w-full flex-col gap-(--message-stack-gap)">
        {showActivity && (
          <WidgetActivityTimeline
            message={message}
            renderActivityItem={renderActivityItem}
            toolDetail={toolDetail}
          />
        )}
        {message.content ? (
          <Message mode={mode} role={message.role} text={message.content} />
        ) : (
          message.isStreaming === true && !showActivity && <WidgetPendingActivityTimeline />
        )}
        {images.length > 0 && <ActivityImages images={images} />}
        {sources.length > 0 && <SourcesFold sources={sources} />}
        <CompletedMessageCopy message={message} />
      </div>
    );
  },
);

const CompletedMessageCopy = ({ message }: { readonly message: WidgetMessage }) => {
  if (message.role !== "assistant" || message.isStreaming === true || !message.content) return null;
  return <MessageActions copyText={message.content} />;
};

const WidgetPendingActivityTimeline = () => {
  const labels = useWidgetLabels();
  const items: readonly ReasoningItem[] = [
    {
      id: "pending-reasoning",
      kind: "thought",
      text: labels.activityPreparing,
    },
  ];
  return (
    <Reasoning
      items={items}
      label={labels.activityThinking}
      onOpenChange={() => undefined}
      open
      thinking
    />
  );
};

const WidgetActivityTimeline = ({
  message,
  renderActivityItem,
  toolDetail,
}: {
  readonly message: WidgetMessage;
  readonly renderActivityItem: RenderActivityItem | undefined;
  readonly toolDetail: ToolDetailLevel;
}) => {
  const labels = useWidgetLabels();
  const thinking = message.isStreaming === true && message.content.trim().length === 0;
  const [open, setOpen] = useState(thinking);
  const duration = readActivityDuration(message);
  const items = useMemo(
    () => toReasoningItems(message, renderActivityItem, toolDetail),
    [message, renderActivityItem, toolDetail],
  );
  const label = readReasoningLabel(thinking, duration, labels);

  useEffect(() => {
    setOpen(thinking);
  }, [thinking]);

  // A tools-only timeline at level "hidden" projects to zero entries: no fold at
  // all beats an expandable "Thought process" that opens onto nothing.
  if (items.length === 0) return null;

  return (
    <Reasoning
      items={items}
      label={label}
      onOpenChange={setOpen}
      open={open}
      renderThought={(text) => (
        <div className="text-sm text-muted-foreground">
          <MarkdownContent mode={message.isStreaming === true ? "streaming" : "static"}>
            {text}
          </MarkdownContent>
        </div>
      )}
      thinking={thinking}
    />
  );
};

const shouldShowActivity = (message: WidgetMessage): boolean =>
  message.role === "assistant" && message.activity.items.length > 0;

const readReasoningLabel = (
  thinking: boolean,
  duration: number | undefined,
  labels: WidgetLabels,
): string => {
  if (thinking) return labels.activityThinking;
  if (duration) return labels.activityThoughtForSeconds(duration);
  return labels.activityThoughtProcess;
};

const readActivityDuration = (message: WidgetMessage): number | undefined => {
  const { completedAt, startedAt } = message.activity;
  if (!completedAt || !startedAt) return undefined;

  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return undefined;

  return Math.max(1, Math.ceil((completed - started) / 1000));
};
