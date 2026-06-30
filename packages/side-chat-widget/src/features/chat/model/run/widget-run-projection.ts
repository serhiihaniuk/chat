import {
  SIDECHAT_EVENT_TYPES,
  type ActivityDetails,
  type JsonObject,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import {
  toHostCommand,
  type HostCommandActivityEvent,
  type HostCommandResult,
} from "@side-chat/host-bridge";

import {
  applyActivityEvent,
  completeActivityTimeline,
  toJsonObject,
  updateActivityItem,
  updateMessage,
  type WidgetMessage,
} from "#entities/chat";

/**
 * Project one ordered stream event onto the assistant message bubble.
 *
 * Pure: it maps source `SidechatStreamEvent`s to target widget message state and
 * never performs I/O. Host-command dispatch is a side effect owned by the run
 * controller; its result is folded back through `applyHostCommandResult`.
 * `started`/`completed` carry run-level data (conversation id, usage) handled by
 * the reducer, so they leave the message list unchanged here.
 */
export const projectEventOntoMessages = (
  messages: readonly WidgetMessage[],
  assistantMessageId: string,
  event: SidechatStreamEvent,
): readonly WidgetMessage[] => {
  switch (event.type) {
    case SIDECHAT_EVENT_TYPES.DELTA:
      return appendAssistantDelta(messages, assistantMessageId, event.content);
    case SIDECHAT_EVENT_TYPES.ACTIVITY:
      return updateMessage(messages, assistantMessageId, (message) => ({
        ...message,
        activity: applyActivityEvent(message.activity, event),
      }));
    case SIDECHAT_EVENT_TYPES.ERROR:
    case SIDECHAT_EVENT_TYPES.BLOCKED:
    case SIDECHAT_EVENT_TYPES.COMPLETED:
      // Every terminal closes the assistant bubble: complete the activity timeline
      // AND clear the streaming flag so the "thinking" indicator resolves.
      return closeAssistantMessage(messages, assistantMessageId, event.createdAt);
    case SIDECHAT_EVENT_TYPES.STARTED:
    case SIDECHAT_EVENT_TYPES.HISTORY:
      return messages;
  }
};

/** Mark the assistant bubble done (used on a terminal status with no event). */
export const closeAssistantMessage = (
  messages: readonly WidgetMessage[],
  assistantMessageId: string,
  completedAt?: string,
): readonly WidgetMessage[] =>
  updateMessage(messages, assistantMessageId, (message) => ({
    ...message,
    activity: completeActivityTimeline(message.activity, completedAt),
    isStreaming: false,
  }));

/**
 * Fold a host-command result into its timeline row.
 *
 * Host commands have richer result statuses, but the timeline item is binary:
 * applied commands complete, every other result is failed.
 */
export const applyHostCommandResult = (
  messages: readonly WidgetMessage[],
  assistantMessageId: string,
  event: HostCommandActivityEvent,
  result: HostCommandResult,
): readonly WidgetMessage[] =>
  updateMessage(messages, assistantMessageId, (message) => ({
    ...message,
    activity: updateActivityItem(message.activity, event.activityId, (item) => ({
      ...item,
      status: result.status === "applied" ? "completed" : "failed",
      details: mergeHostCommandResult(item.details, result),
    })),
  }));

const appendAssistantDelta = (
  messages: readonly WidgetMessage[],
  assistantMessageId: string,
  content: string,
): readonly WidgetMessage[] =>
  updateMessage(messages, assistantMessageId, (message) => ({
    ...message,
    content: `${message.content}${content}`,
  }));

const mergeHostCommandResult = (
  details: ActivityDetails | undefined,
  result: HostCommandResult,
): ActivityDetails | undefined => {
  if (!details?.hostCommand) return details;
  return {
    ...details,
    hostCommand: { ...details.hostCommand, result: toHostCommandResultJson(result) },
  };
};

export const toHostCommandResultJson = (result: HostCommandResult): JsonObject =>
  toJsonObject({
    commandId: result.commandId,
    commandName: result.commandName,
    status: result.status,
    resultCode: result.resultCode,
    resolvedAt: result.resolvedAt,
    data: result.data,
  });

/** Re-export the host-command type narrowing helper alongside the projection. */
export { isHostCommandActivityEvent } from "@side-chat/host-bridge";

/** Build the runtime host command shape for dispatch from an activity event. */
export const toRunHostCommand = (event: HostCommandActivityEvent) => toHostCommand(event);
