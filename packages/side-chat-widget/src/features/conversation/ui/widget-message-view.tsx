import { ACTIVITY_KINDS } from "@side-chat/chat-protocol";
import { memo, useEffect, useMemo, useState } from "react";

import type { WidgetActivityItem, WidgetMessage } from "#entities/chat";
import type { ReasoningVisibility } from "#entities/settings";
import { Message } from "#shared/ui/message";
import { Reasoning, type ReasoningItem } from "#shared/ui/reasoning";
import type { ToolState } from "#shared/ui/tool-row";

// Wrapped in memo so a streaming token only re-renders the message that actually
// changed, not every message in the list. This works because updating a message
// builds a new array but keeps the exact same object for every unchanged message.
export const WidgetMessageView = memo(
  ({
    message,
    reasoningVisibility,
  }: {
    readonly message: WidgetMessage;
    readonly reasoningVisibility: ReasoningVisibility;
  }) => {
    const showActivity = shouldShowActivity(message);
    const mode = message.isStreaming === true ? "streaming" : "static";

    return (
      <div className="flex w-full flex-col gap-2">
        {showActivity && (
          <WidgetActivityTimeline message={message} reasoningVisibility={reasoningVisibility} />
        )}
        {message.content ? (
          <Message mode={mode} role={message.role} text={message.content} />
        ) : (
          message.isStreaming === true &&
          !showActivity && <Message mode="streaming" role="assistant" text="Thinking..." />
        )}
      </div>
    );
  },
);

const WidgetActivityTimeline = ({
  message,
  reasoningVisibility,
}: {
  readonly message: WidgetMessage;
  readonly reasoningVisibility: ReasoningVisibility;
}) => {
  const shouldOpenByDefault = shouldOpenActivityByDefault(message.isStreaming, reasoningVisibility);
  const [open, setOpen] = useState(shouldOpenByDefault);
  const duration = readActivityDuration(message);
  const items = useMemo(() => toReasoningItems(message), [message]);
  const label = readReasoningLabel(message, duration);

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

const toReasoningItems = (message: WidgetMessage): readonly ReasoningItem[] =>
  message.activity.items.map((item) => {
    if (item.kind === ACTIVITY_KINDS.TOOL || item.kind === ACTIVITY_KINDS.HOST_COMMAND) {
      return {
        id: item.id,
        kind: "tool",
        name: item.title,
        state: toToolState(item, message.activity.activeItemId === item.id),
      };
    }

    return {
      id: item.id,
      kind: "thought",
      text: readThoughtText(item),
    };
  });

const readThoughtText = (item: WidgetActivityItem): string =>
  item.body ? `${item.title}: ${item.body}` : item.title;

const shouldShowActivity = (message: WidgetMessage): boolean =>
  message.role === "assistant" && message.activity.items.length > 0;

const shouldOpenActivityByDefault = (
  isStreaming: boolean | undefined,
  reasoningVisibility: ReasoningVisibility,
): boolean => isStreaming === true || reasoningVisibility === "detailed";

const toToolState = (item: WidgetActivityItem, isActive: boolean): ToolState => {
  if (item.status === "running" && isActive) return "running";
  if (item.status === "failed") return "error";
  return "success";
};

const readReasoningLabel = (message: WidgetMessage, duration: number | undefined): string => {
  if (message.isStreaming === true) return "Thinking...";
  if (duration) return `Thought for ${duration}s`;
  return "Thought process";
};

const readActivityDuration = (message: WidgetMessage): number | undefined => {
  const { completedAt, startedAt } = message.activity;
  if (!completedAt || !startedAt) return undefined;

  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return undefined;

  return Math.max(1, Math.ceil((completed - started) / 1000));
};
