import type { ChatClient } from "@side-chat/chat-client";
import type { HostBridge } from "@side-chat/host-bridge";
import { useCallback, useRef, useState } from "react";

import {
  completeActivityTimeline,
  createId,
  createWidgetChatRequest,
  createWidgetMessage,
  toErrorMessage,
  updateMessage,
  type WidgetMessage,
  type WidgetStatus,
  type WidgetUsage,
} from "#entities/chat";
import { useWidgetStreamEvents } from "./widget-stream-events.js";

export const useWidgetChat = ({
  client,
  hostBridge,
  selectedProfileId,
}: {
  readonly client: ChatClient;
  readonly hostBridge: Pick<HostBridge, "getContext" | "dispatchCommand"> | undefined;
  readonly selectedProfileId: string | undefined;
}) => {
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [status, setStatus] = useState<WidgetStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [usage, setUsage] = useState<WidgetUsage | undefined>();
  const [conversationId, setConversationId] = useState<string | undefined>();
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const applyStreamEvent = useWidgetStreamEvents(
    { setMessages, setStatus, setErrorMessage, setUsage, setConversationId },
    hostBridge,
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
        const request = createWidgetChatRequest({
          assistantProfileId: selectedProfileId,
          conversationId,
          hostContext,
          message: trimmed,
          messageId: userMessageId,
          requestId,
        });

        const result = await client.streamChat(request, {
          signal: abortController.signal,
        });
        setStatus("streaming");

        for await (const event of result.events) {
          if (abortController.signal.aborted) break;
          await applyStreamEvent(event, assistantMessageId);
        }

        setMessages((current) => completeAssistantMessage(current, assistantMessageId));
        setStatus("idle");
      } catch (error) {
        setMessages((current) => completeAssistantMessage(current, assistantMessageId));

        if (abortController.signal.aborted) {
          setStatus("idle");
          return;
        }

        setStatus("error");
        setErrorMessage(toErrorMessage(error));
      }
    },
    [applyStreamEvent, client, conversationId, hostBridge, selectedProfileId, status],
  );

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(undefined);
    setStatus(clearErrorStatus);
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

const completeAssistantMessage = (
  messages: readonly WidgetMessage[],
  assistantMessageId: string,
): WidgetMessage[] =>
  updateMessage(messages, assistantMessageId, (message) => ({
    ...message,
    activity: completeActivityTimeline(message.activity),
    isStreaming: false,
  }));

const clearErrorStatus = (status: WidgetStatus): WidgetStatus =>
  status === "error" ? "idle" : status;
