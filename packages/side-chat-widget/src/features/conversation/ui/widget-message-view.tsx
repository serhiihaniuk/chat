import { memo, useEffect, useMemo, useState } from "react";

import type { WidgetMessage } from "#entities/chat";
import type { ReasoningVisibility } from "#entities/settings";
import { useWidgetLabels, type WidgetLabels } from "#shared/lib/widget-labels";
import { ActivityImages } from "#shared/ui/activity/activity-images";
import { SourcesFold } from "#shared/ui/activity/citations";
import { Message } from "#shared/ui/message";
import { Reasoning, type ReasoningItem } from "#shared/ui/reasoning";
import {
  readMessageImages,
  readMessageSources,
  toReasoningItems,
  type RenderActivityItem,
} from "./activity/widget-activity-content.js";

// Wrapped in memo so a streaming token only re-renders the message that actually
// changed, not every message in the list. This works because updating a message
// builds a new array but keeps the exact same object for every unchanged message.
export const WidgetMessageView = memo(
  ({
    message,
    reasoningVisibility,
    renderActivityItem,
  }: {
    readonly message: WidgetMessage;
    readonly reasoningVisibility: ReasoningVisibility;
    readonly renderActivityItem?: RenderActivityItem | undefined;
  }) => {
    const showActivity = shouldShowActivity(message);
    const mode = message.isStreaming === true ? "streaming" : "static";
    const images = readMessageImages(message);
    const sources = readMessageSources(message);

    return (
      <div className="flex w-full flex-col gap-2">
        {showActivity && (
          <WidgetActivityTimeline
            message={message}
            reasoningVisibility={reasoningVisibility}
            renderActivityItem={renderActivityItem}
          />
        )}
        {message.content ? (
          <Message mode={mode} role={message.role} text={message.content} />
        ) : (
          message.isStreaming === true && !showActivity && <WidgetPendingActivityTimeline />
        )}
        {images.length > 0 && <ActivityImages images={images} />}
        {sources.length > 0 && <SourcesFold sources={sources} />}
      </div>
    );
  },
);

const WidgetPendingActivityTimeline = () => {
  const labels = useWidgetLabels();
  const items: readonly ReasoningItem[] = [
    { id: "pending-reasoning", kind: "thought", text: labels.activityPreparing },
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
  reasoningVisibility,
  renderActivityItem,
}: {
  readonly message: WidgetMessage;
  readonly reasoningVisibility: ReasoningVisibility;
  readonly renderActivityItem: RenderActivityItem | undefined;
}) => {
  const labels = useWidgetLabels();
  const shouldOpenByDefault = shouldOpenActivityByDefault(message.isStreaming, reasoningVisibility);
  const [open, setOpen] = useState(shouldOpenByDefault);
  const duration = readActivityDuration(message);
  const items = useMemo(
    () => toReasoningItems(message, renderActivityItem),
    [message, renderActivityItem],
  );
  const label = readReasoningLabel(message, duration, labels);

  useEffect(() => {
    if (shouldOpenByDefault) {
      setOpen(true);
    }
  }, [shouldOpenByDefault]);

  useEffect(() => {
    if (shouldOpenByDefault) {
      return;
    }

    if (message.content) {
      setOpen(false);
    }
  }, [message.content, shouldOpenByDefault]);

  return (
    <Reasoning
      items={items}
      label={label}
      onOpenChange={setOpen}
      open={open}
      thinking={message.isStreaming === true}
    />
  );
};

const shouldShowActivity = (message: WidgetMessage): boolean =>
  message.role === "assistant" && message.activity.items.length > 0;

const shouldOpenActivityByDefault = (
  isStreaming: boolean | undefined,
  reasoningVisibility: ReasoningVisibility,
): boolean => isStreaming === true || reasoningVisibility === "detailed";

const readReasoningLabel = (
  message: WidgetMessage,
  duration: number | undefined,
  labels: WidgetLabels,
): string => {
  if (message.isStreaming === true) return labels.activityThinking;
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
