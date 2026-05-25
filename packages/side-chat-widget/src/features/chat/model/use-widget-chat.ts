import {
  SIDECHAT_EVENT_TYPES,
  type ChatStreamRequest,
  type ActivityDetails,
  type HostContext,
  type JsonObject,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import type { ChatClient } from "@side-chat/chat-client";
import {
  isHostCommandActivityEvent,
  type HostBridge,
  type HostCommandActivityEvent,
  type HostCommandResult,
} from "@side-chat/host-bridge";
import { useCallback, useRef, useState } from "react";

import {
  applyActivityEvent,
  completeActivityTimeline,
  createDefaultRequest,
  createId,
  createWidgetMessage,
  toJsonObject,
  updateActivityItem,
  toErrorMessage,
  updateMessage,
  type WidgetMessage,
  type WidgetStatus,
  type WidgetUsage,
} from "#entities/chat";

type WidgetChatRequestFactory = (message: string, hostContext?: HostContext) => ChatStreamRequest;

export const useWidgetChat = ({
  client,
  hostBridge,
  requestFactory,
  selectedProfileId,
}: {
  readonly client: ChatClient;
  readonly hostBridge: Pick<HostBridge, "getContext" | "dispatchCommand"> | undefined;
  readonly requestFactory: WidgetChatRequestFactory | undefined;
  readonly selectedProfileId: string | undefined;
}) => {
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [status, setStatus] = useState<WidgetStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [usage, setUsage] = useState<WidgetUsage | undefined>();
  const abortControllerRef = useRef<AbortController | undefined>(undefined);

  const dispatchHostCommand = useCallback(
    async (
      event: HostCommandActivityEvent,
      assistantMessageId: string,
      bridge: Pick<HostBridge, "dispatchCommand"> | undefined,
    ): Promise<void> => {
      if (!bridge) {
        setMessages((current) =>
          updateMessage(current, assistantMessageId, (message) => ({
            ...message,
            activity: updateHostCommandActivity(message.activity, event.activityId, "failed"),
          })),
        );
        return;
      }

      try {
        const result = await bridge.dispatchCommand(event);
        setMessages((current) =>
          updateMessage(current, assistantMessageId, (message) => ({
            ...message,
            activity: updateHostCommandActivity(
              message.activity,
              event.activityId,
              result.status === "applied" ? "completed" : "failed",
              result,
            ),
          })),
        );
      } catch {
        setMessages((current) =>
          updateMessage(current, assistantMessageId, (message) => ({
            ...message,
            activity: updateHostCommandActivity(message.activity, event.activityId, "failed"),
          })),
        );
      }
    },
    [],
  );

  const applyStreamEvent = useCallback(
    async (
      event: SidechatStreamEvent,
      assistantMessageId: string,
      bridge: Pick<HostBridge, "dispatchCommand"> | undefined,
    ): Promise<void> => {
      switch (event.type) {
        case SIDECHAT_EVENT_TYPES.DELTA:
          setMessages((current) =>
            updateMessage(current, assistantMessageId, (message) => ({
              ...message,
              content: `${message.content}${event.content}`,
            })),
          );
          return;

        case SIDECHAT_EVENT_TYPES.ACTIVITY:
          setMessages((current) =>
            updateMessage(current, assistantMessageId, (message) => ({
              ...message,
              activity: applyActivityEvent(message.activity, event),
            })),
          );
          if (isHostCommandActivityEvent(event)) {
            await dispatchHostCommand(event, assistantMessageId, bridge);
          }
          return;

        case SIDECHAT_EVENT_TYPES.ERROR:
          setErrorMessage(event.message);
          setStatus("error");
          setMessages((current) =>
            updateMessage(current, assistantMessageId, (message) => ({
              ...message,
              activity: completeActivityTimeline(message.activity, event.createdAt),
              isStreaming: false,
            })),
          );
          return;

        case SIDECHAT_EVENT_TYPES.COMPLETED:
          setUsage(event.usage);
          setMessages((current) =>
            updateMessage(current, assistantMessageId, (message) => ({
              ...message,
              activity: completeActivityTimeline(message.activity, event.createdAt),
            })),
          );
          return;

        case SIDECHAT_EVENT_TYPES.STARTED:
        case SIDECHAT_EVENT_TYPES.HISTORY:
          return;
      }
    },
    [dispatchHostCommand],
  );

  const submitMessage = useCallback(
    async (messageText: string) => {
      const trimmed = messageText.trim();
      if (!trimmed || status === "submitted" || status === "streaming") return;

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const requestId = createId("request");
      const userMessageId = createId("user");
      const assistantMessageId = createId("assistant");
      const userMessage = createWidgetMessage(userMessageId, "user", trimmed);
      const assistantMessage = createWidgetMessage(assistantMessageId, "assistant", "", true);

      setMessages((current) => [...current, userMessage, assistantMessage]);
      setStatus("submitted");
      setErrorMessage(undefined);

      try {
        const hostContext = await hostBridge?.getContext({ requestId });
        const request =
          requestFactory?.(trimmed, hostContext) ??
          createDefaultRequest({
            assistantProfileId: selectedProfileId,
            content: trimmed,
            hostContext,
            messageId: userMessageId,
            requestId,
          });

        const result = await client.streamChat(request, {
          signal: abortController.signal,
        });
        setStatus("streaming");

        for await (const event of result.events) {
          if (abortController.signal.aborted) break;
          await applyStreamEvent(event, assistantMessageId, hostBridge);
        }

        setMessages((current) =>
          updateMessage(current, assistantMessageId, (message) => ({
            ...message,
            activity: completeActivityTimeline(message.activity),
            isStreaming: false,
          })),
        );
        setStatus("idle");
      } catch (error) {
        setMessages((current) =>
          updateMessage(current, assistantMessageId, (message) => ({
            ...message,
            activity: completeActivityTimeline(message.activity),
            isStreaming: false,
          })),
        );

        if (abortController.signal.aborted) {
          setStatus("idle");
          return;
        }

        setStatus("error");
        setErrorMessage(toErrorMessage(error));
      }
    },
    [applyStreamEvent, client, hostBridge, requestFactory, selectedProfileId, status],
  );

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(undefined);
    setStatus((currentStatus) => (currentStatus === "error" ? "idle" : currentStatus));
  }, []);

  return {
    clearError,
    errorMessage,
    messages,
    setErrorMessage,
    status,
    stop,
    submitMessage,
    usage,
  };
};

const updateHostCommandActivity = (
  activity: WidgetMessage["activity"],
  activityId: string,
  status: "completed" | "failed",
  result?: HostCommandResult,
): WidgetMessage["activity"] =>
  updateActivityItem(activity, activityId, (item) => ({
    ...item,
    status,
    details: mergeHostCommandResult(item.details, result),
  }));

const mergeHostCommandResult = (
  details: ActivityDetails | undefined,
  result: HostCommandResult | undefined,
): ActivityDetails | undefined => {
  if (!result) return details;
  if (!details?.hostCommand) return details;
  return {
    ...details,
    hostCommand: {
      ...details.hostCommand,
      result: toHostCommandResultJson(result),
    },
  };
};

const toHostCommandResultJson = (result: HostCommandResult): JsonObject =>
  toJsonObject({
    commandId: result.commandId,
    commandName: result.commandName,
    status: result.status,
    resultCode: result.resultCode,
    resolvedAt: result.resolvedAt,
    data: result.data,
  });
