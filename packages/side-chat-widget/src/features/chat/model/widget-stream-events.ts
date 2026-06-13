import {
  SIDECHAT_EVENT_TYPES,
  type ActivityDetails,
  type JsonObject,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import {
  createCommandResult,
  isHostCommandActivityEvent,
  toHostCommand,
  type HostBridge,
  type HostCommandActivityEvent,
  type HostCommandResult,
} from "@side-chat/host-bridge";
import { useCallback, type Dispatch, type SetStateAction } from "react";

import {
  applyActivityEvent,
  completeActivityTimeline,
  toErrorMessage,
  toJsonObject,
  updateActivityItem,
  updateMessage,
  type WidgetMessage,
  type WidgetStatus,
  type WidgetUsage,
} from "#entities/chat";

type WidgetStreamEventActions = {
  readonly setMessages: Dispatch<SetStateAction<WidgetMessage[]>>;
  readonly setStatus: Dispatch<SetStateAction<WidgetStatus>>;
  readonly setErrorMessage: Dispatch<SetStateAction<string | undefined>>;
  readonly setUsage: Dispatch<SetStateAction<WidgetUsage | undefined>>;
  readonly setConversationId: Dispatch<SetStateAction<string | undefined>>;
};

export const useWidgetStreamEvents = (
  actions: WidgetStreamEventActions,
  hostBridge: Pick<HostBridge, "dispatchCommand"> | undefined,
) => {
  const dispatchHostCommand = useCallback(
    (event: HostCommandActivityEvent, assistantMessageId: string): Promise<void> =>
      dispatchHostCommandActivity(actions, hostBridge, event, assistantMessageId),
    [actions, hostBridge],
  );

  return useCallback(
    (event: SidechatStreamEvent, assistantMessageId: string): Promise<void> =>
      applyWidgetStreamEvent(actions, dispatchHostCommand, event, assistantMessageId),
    [actions, dispatchHostCommand],
  );
};

const dispatchHostCommandActivity = async (
  actions: WidgetStreamEventActions,
  hostBridge: Pick<HostBridge, "dispatchCommand"> | undefined,
  event: HostCommandActivityEvent,
  assistantMessageId: string,
): Promise<void> => {
  if (!hostBridge) {
    recordHostCommandResult(
      actions,
      assistantMessageId,
      event,
      createFailedHostCommandResult(event, "host_bridge_unavailable"),
    );
    return;
  }

  try {
    recordHostCommandResult(
      actions,
      assistantMessageId,
      event,
      await hostBridge.dispatchCommand(event),
    );
  } catch (error) {
    recordHostCommandResult(
      actions,
      assistantMessageId,
      event,
      createFailedHostCommandResult(event, "host_command_exception", error),
    );
  }
};

const applyWidgetStreamEvent = async (
  actions: WidgetStreamEventActions,
  dispatchHostCommand: (
    event: HostCommandActivityEvent,
    assistantMessageId: string,
  ) => Promise<void>,
  event: SidechatStreamEvent,
  assistantMessageId: string,
): Promise<void> => {
  switch (event.type) {
    case SIDECHAT_EVENT_TYPES.DELTA:
      actions.setMessages((current) =>
        appendAssistantDelta(current, assistantMessageId, event.content),
      );
      return;

    case SIDECHAT_EVENT_TYPES.ACTIVITY:
      actions.setMessages((current) => applyAssistantActivity(current, assistantMessageId, event));
      if (isHostCommandActivityEvent(event)) {
        await dispatchHostCommand(event, assistantMessageId);
      }
      return;

    case SIDECHAT_EVENT_TYPES.ERROR:
      actions.setErrorMessage(event.message);
      actions.setStatus("error");
      actions.setMessages((current) =>
        completeAssistantActivity(current, assistantMessageId, event.createdAt),
      );
      return;

    case SIDECHAT_EVENT_TYPES.COMPLETED:
      actions.setUsage(event.usage);
      actions.setMessages((current) =>
        completeAssistantTimeline(current, assistantMessageId, event.createdAt),
      );
      return;

    case SIDECHAT_EVENT_TYPES.STARTED:
      if (event.conversationId) actions.setConversationId(event.conversationId);
      return;

    case SIDECHAT_EVENT_TYPES.HISTORY:
      return;
  }
};

const recordHostCommandResult = (
  actions: WidgetStreamEventActions,
  assistantMessageId: string,
  event: HostCommandActivityEvent,
  result: HostCommandResult,
): void => {
  actions.setMessages((current) =>
    updateHostCommandResult(current, assistantMessageId, event, result),
  );
};

const appendAssistantDelta = (
  messages: readonly WidgetMessage[],
  assistantMessageId: string,
  content: string,
): WidgetMessage[] =>
  updateMessage(messages, assistantMessageId, (message) => ({
    ...message,
    content: `${message.content}${content}`,
  }));

const applyAssistantActivity = (
  messages: readonly WidgetMessage[],
  assistantMessageId: string,
  event: SidechatStreamEvent,
): WidgetMessage[] =>
  event.type === SIDECHAT_EVENT_TYPES.ACTIVITY
    ? updateMessage(messages, assistantMessageId, (message) => ({
        ...message,
        activity: applyActivityEvent(message.activity, event),
      }))
    : [...messages];

const completeAssistantActivity = (
  messages: readonly WidgetMessage[],
  assistantMessageId: string,
  createdAt: string,
): WidgetMessage[] =>
  updateMessage(messages, assistantMessageId, (message) => ({
    ...message,
    activity: completeActivityTimeline(message.activity, createdAt),
    isStreaming: false,
  }));

const completeAssistantTimeline = (
  messages: readonly WidgetMessage[],
  assistantMessageId: string,
  createdAt: string,
): WidgetMessage[] =>
  updateMessage(messages, assistantMessageId, (message) => ({
    ...message,
    activity: completeActivityTimeline(message.activity, createdAt),
  }));

const updateHostCommandResult = (
  messages: readonly WidgetMessage[],
  assistantMessageId: string,
  event: HostCommandActivityEvent,
  result: HostCommandResult,
): WidgetMessage[] =>
  updateMessage(messages, assistantMessageId, (message) => ({
    ...message,
    activity: updateHostCommandActivity(
      message.activity,
      event.activityId,
      result.status === "applied" ? "completed" : "failed",
      result,
    ),
  }));

const updateHostCommandActivity = (
  activity: WidgetMessage["activity"],
  activityId: string,
  status: "completed" | "failed",
  result: HostCommandResult,
): WidgetMessage["activity"] =>
  updateActivityItem(activity, activityId, (item) => ({
    ...item,
    status,
    details: mergeHostCommandResult(item.details, result),
  }));

const mergeHostCommandResult = (
  details: ActivityDetails | undefined,
  result: HostCommandResult,
): ActivityDetails | undefined => {
  if (!details?.hostCommand) return details;
  return {
    ...details,
    hostCommand: {
      ...details.hostCommand,
      result: toHostCommandResultJson(result),
    },
  };
};

const createFailedHostCommandResult = (
  event: HostCommandActivityEvent,
  resultCode: string,
  error?: unknown,
): HostCommandResult =>
  createCommandResult(toHostCommand(event), {
    status: "failed",
    resultCode,
    ...(error ? { data: toJsonObject({ message: toErrorMessage(error) }) } : {}),
  });

const toHostCommandResultJson = (result: HostCommandResult): JsonObject =>
  toJsonObject({
    commandId: result.commandId,
    commandName: result.commandName,
    status: result.status,
    resultCode: result.resultCode,
    resolvedAt: result.resolvedAt,
    data: result.data,
  });
