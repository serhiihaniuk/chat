import {
  SIDECHAT_EVENT_TYPES,
  type HostCommandEvent,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import type { HostBridge } from "@side-chat/host-bridge";
import { useCallback, useRef, useState } from "react";

import {
  createDefaultRequest,
  createId,
  createWidgetMessage,
  toErrorMessage,
  updateHostCommand,
  updateMessage,
  upsertToolEvent,
} from "./widget-state.js";
import type {
  SideChatWidgetProps,
  WidgetMessage,
  WidgetStatus,
} from "./widget.types.js";

export const useWidgetChat = ({
  client,
  hostBridge,
  requestFactory,
  selectedProfileId,
}: {
  readonly client: SideChatWidgetProps["client"];
  readonly hostBridge: SideChatWidgetProps["hostBridge"];
  readonly requestFactory: SideChatWidgetProps["requestFactory"];
  readonly selectedProfileId: string | undefined;
}) => {
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [status, setStatus] = useState<WidgetStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const abortControllerRef = useRef<AbortController | undefined>(undefined);

  const dispatchHostCommand = useCallback(
    async (
      event: HostCommandEvent,
      assistantMessageId: string,
      bridge: Pick<HostBridge, "dispatchCommand"> | undefined,
    ): Promise<void> => {
      setMessages((current) =>
        updateMessage(current, assistantMessageId, (message) => ({
          ...message,
          hostCommands: [...message.hostCommands, { event, status: "running" }],
        })),
      );

      if (!bridge) return;

      try {
        const result = await bridge.dispatchCommand(event);
        setMessages((current) =>
          updateHostCommand(current, assistantMessageId, event.commandId, {
            event,
            result,
            status: "completed",
          }),
        );
      } catch {
        setMessages((current) =>
          updateHostCommand(current, assistantMessageId, event.commandId, {
            event,
            status: "failed",
          }),
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

        case SIDECHAT_EVENT_TYPES.REASONING:
          setMessages((current) =>
            updateMessage(current, assistantMessageId, (message) => ({
              ...message,
              reasoning: [...message.reasoning, event.summary],
            })),
          );
          return;

        case SIDECHAT_EVENT_TYPES.TOOL:
          setMessages((current) =>
            updateMessage(current, assistantMessageId, (message) => ({
              ...message,
              tools: upsertToolEvent(message.tools, event),
            })),
          );
          return;

        case SIDECHAT_EVENT_TYPES.HOST_COMMAND:
          await dispatchHostCommand(event, assistantMessageId, bridge);
          return;

        case SIDECHAT_EVENT_TYPES.ERROR:
          setErrorMessage(event.message);
          setStatus("error");
          setMessages((current) =>
            updateMessage(current, assistantMessageId, (message) => ({
              ...message,
              isStreaming: false,
            })),
          );
          return;

        case SIDECHAT_EVENT_TYPES.STARTED:
        case SIDECHAT_EVENT_TYPES.COMPLETED:
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
      const assistantMessage = createWidgetMessage(
        assistantMessageId,
        "assistant",
        "",
        true,
      );

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
            isStreaming: false,
          })),
        );
        setStatus("idle");
      } catch (error) {
        setMessages((current) =>
          updateMessage(current, assistantMessageId, (message) => ({
            ...message,
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
    [
      applyStreamEvent,
      client,
      hostBridge,
      requestFactory,
      selectedProfileId,
      status,
    ],
  );

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    errorMessage,
    messages,
    setErrorMessage,
    status,
    stop,
    submitMessage,
  };
};
