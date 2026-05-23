import { useCallback, useEffect, useRef, useState } from "react";
import {
  protocolVersion,
  type HostCommand,
  type HostCommandResult,
  type HostContextSnapshot,
  type ModelSelection,
  type SidechatStreamEvent,
  type TokenUsage,
} from "@side-chat/shared-protocol";
import {
  applySideChatStreamEventToMessages,
  completeHostCommandPartInMessages,
  getSideChatStreamEventEffect,
  type WidgetMessage,
} from "../../domain/message/stream-event-state.js";
import {
  createChatRequestPayload,
  deriveHistoryEndpoint,
  deriveUsageEndpoint,
  randomId,
  requestError,
  type SideChatError,
} from "./use-side-chat/request.js";
import { readSideChatStreamEvents } from "./use-side-chat/stream-reader.js";

/**
 * React/browser adapter for the widget hexagon. It owns fetch, SSE reading,
 * history/usage calls, host bridge callbacks, and React state; pure protocol
 * decoding and message projection stay in application/domain modules.
 */
export {
  appendReasoningPart,
  upsertHostCommandPart,
  upsertToolPart,
} from "../../domain/message/stream-event-state.js";
export type {
  WidgetHostCommandPart,
  WidgetMessage,
  WidgetMessagePart,
  WidgetReasoningPart,
  WidgetToolPart,
} from "../../domain/message/stream-event-state.js";
export {
  createChatRequestPayload,
  type CreateChatRequestPayloadInput,
  type SideChatError,
} from "./use-side-chat/request.js";
export { readSideChatStreamEvents } from "./use-side-chat/stream-reader.js";

export type UseSideChatOptions = {
  apiEndpoint: string;
  workspaceId: string;
  initialConversationId?: string;
  historyEndpoint?: string;
  historyResetEndpoint?: string;
  defaultModel: ModelSelection;
  getHostContext?: () =>
    | HostContextSnapshot
    | undefined
    | Promise<HostContextSnapshot | undefined>;
  dispatchHostCommand?: (
    command: HostCommand,
  ) => HostCommandResult | Promise<HostCommandResult>;
  onError?: (error: SideChatError) => void;
  onUsage?: (usage: TokenUsage) => void;
};

export type HistoryStatus = "idle" | "loading" | "loaded" | "empty" | "error";

export function useSideChat(options: UseSideChatOptions) {
  const {
    apiEndpoint,
    workspaceId,
    initialConversationId,
    historyEndpoint: explicitHistoryEndpoint,
    historyResetEndpoint: explicitHistoryResetEndpoint,
    defaultModel,
    getHostContext,
    dispatchHostCommand: dispatchHostCommandOption,
    onError,
    onUsage,
  } = options;
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<SideChatError | undefined>();
  const [usage, setUsage] = useState<TokenUsage | undefined>();
  const [model, setModelState] = useState(defaultModel);
  const [lastUserMessage, setLastUserMessage] = useState<string | undefined>();
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("idle");
  const [activeAssistantMessageId, setActiveAssistantMessageId] = useState<
    string | undefined
  >();
  const onErrorRef = useRef(onError);
  const onUsageRef = useRef(onUsage);
  const historyEndpoint =
    explicitHistoryEndpoint ?? deriveHistoryEndpoint(apiEndpoint);
  const historyResetEndpoint = explicitHistoryResetEndpoint ?? historyEndpoint;
  const usageEndpoint = deriveUsageEndpoint(apiEndpoint);

  onErrorRef.current = onError;
  onUsageRef.current = onUsage;

  const refreshUsage = useCallback(
    async (conversationId: string) => {
      const response = await fetch(
        `${usageEndpoint}?workspaceId=${encodeURIComponent(workspaceId)}&conversationId=${encodeURIComponent(conversationId)}`,
      );

      if (!response.ok) return;

      const payload = (await response.json()) as {
        usage: TokenUsage | null;
      };
      if (payload.usage) {
        setUsage(payload.usage);
        onUsageRef.current?.(payload.usage);
      }
    },
    [usageEndpoint, workspaceId],
  );

  useEffect(() => {
    if (!initialConversationId) {
      setHistoryStatus("idle");
      return;
    }

    let aborted = false;
    const conversationId = initialConversationId;
    const loadHistory = async () => {
      try {
        setIsLoadingHistory(true);
        setHistoryStatus("loading");
        const response = await fetch(
          `${historyEndpoint}?workspaceId=${encodeURIComponent(workspaceId)}&conversationId=${encodeURIComponent(conversationId)}`,
        );

        if (!response.ok) {
          throw new Error(`History load failed: ${response.status}`);
        }

        const payload = (await response.json()) as {
          messages: Array<{
            id: string;
            role: string;
            content: string;
            metadata?: Record<string, unknown>;
          }>;
        };
        if (aborted) return;
        const nextMessages: WidgetMessage[] = payload.messages.map(
          (message) => ({
            id: message.id,
            role:
              message.role === "assistant" ||
              message.role === "user" ||
              message.role === "system"
                ? message.role
                : "system",
            content: message.content,
            metadata: message.metadata,
          }),
        );
        setMessages(nextMessages);
        setHistoryStatus(nextMessages.length > 0 ? "loaded" : "empty");
        void refreshUsage(conversationId);
      } catch (unknownError) {
        if (aborted) return;
        const historyError = requestError(
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to load conversation history",
          "history-load",
        );
        setHistoryStatus("error");
        setError(historyError);
        onErrorRef.current?.(historyError);
      } finally {
        if (!aborted) {
          setIsLoadingHistory(false);
        }
      }
    };

    void loadHistory();

    return () => {
      aborted = true;
      setIsLoadingHistory(false);
    };
  }, [
    historyEndpoint,
    initialConversationId,
    refreshUsage,
    workspaceId,
  ]);

  const dispatchHostCommand = useCallback(
    async (command: HostCommand): Promise<HostCommandResult> => {
      if (!dispatchHostCommandOption) {
        return {
          status: "unsupported",
          message: "No host command dispatcher is configured.",
        };
      }

      try {
        return await dispatchHostCommandOption(command);
      } catch (unknownError) {
        return {
          status: "error",
          message:
            unknownError instanceof Error
              ? unknownError.message
              : "Host command failed.",
        };
      }
    },
    [dispatchHostCommandOption],
  );

  const handleEvent = useCallback(
    (event: SidechatStreamEvent) => {
      setMessages((current) =>
        applySideChatStreamEventToMessages(current, event),
      );

      const effect = getSideChatStreamEventEffect(event);
      switch (effect.kind) {
        case "started":
          setActiveAssistantMessageId(effect.activeAssistantMessageId);
          return;

        case "completed":
          setActiveAssistantMessageId(undefined);
          setError(undefined);
          void refreshUsage(effect.conversationId).catch(() => {
            setUsage(effect.fallbackUsage);
            onUsageRef.current?.(effect.fallbackUsage);
          });
          return;

        case "error":
          setActiveAssistantMessageId(undefined);
          setError(effect.error);
          onErrorRef.current?.(effect.error);
          return;

        case "host-command":
          void dispatchHostCommand(effect.command).then((result) => {
            setMessages((current) =>
              completeHostCommandPartInMessages(current, effect.messageId, {
                ...effect.pendingHostCommand,
                status: result.status,
                result,
              }),
            );
          });
          return;

        case "none":
          return;
      }
    },
    [dispatchHostCommand, refreshUsage],
  );

  const sendMessage = useCallback(
    async (
      content: string,
      optionsParam?: { displayContent?: string; isRetry?: boolean },
    ) => {
      const trimmed = content.trim();
      if (!trimmed || isStreaming) return;
      const displayContent = optionsParam?.displayContent?.trim() || trimmed;

      const requestId = randomId();
      const messageId = randomId();
      if (!optionsParam?.isRetry) {
        setMessages((current) => [
          ...current,
          { id: messageId, role: "user", content: displayContent },
        ]);
      }

      setError(undefined);
      setLastUserMessage(trimmed);
      setIsStreaming(true);
      setActiveAssistantMessageId(undefined);

      try {
        let hostContext: HostContextSnapshot | undefined;
        try {
          hostContext = await getHostContext?.();
        } catch {
          hostContext = undefined;
        }

        const response = await fetch(apiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "X-Sidechat-Protocol": protocolVersion,
            "X-Request-Id": requestId,
          },
          body: JSON.stringify(
            createChatRequestPayload({
              workspaceId,
              conversationId: initialConversationId,
              messageId,
              content: trimmed,
              model,
              hostContext,
            }),
          ),
        });

        if (!response.ok) {
          throw new Error(`Chat request failed: ${response.status}`);
        }

        await readSideChatStreamEvents(
          response,
          handleEvent,
          (message: string) => {
            throw new Error(message);
          },
        );
      } catch (unknownError) {
        const nextError = requestError(
          unknownError instanceof Error
            ? unknownError.message
            : "Chat request failed",
          requestId,
        );
        setError(nextError);
        onErrorRef.current?.(nextError);
      } finally {
        setIsStreaming(false);
      }
    },
    [
      apiEndpoint,
      getHostContext,
      handleEvent,
      initialConversationId,
      isStreaming,
      model,
      workspaceId,
    ],
  );

  const resetConversation = useCallback(async () => {
    if (isStreaming) return;

    setError(undefined);
    setLastUserMessage(undefined);
    setActiveAssistantMessageId(undefined);
    setUsage(undefined);

    if (!initialConversationId) {
      setMessages([]);
      setHistoryStatus("empty");
      return;
    }

    try {
      setIsLoadingHistory(true);
      setHistoryStatus("loading");
      const response = await fetch(
        `${historyResetEndpoint}?workspaceId=${encodeURIComponent(workspaceId)}&conversationId=${encodeURIComponent(initialConversationId)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error(`Conversation reset failed: ${response.status}`);
      }

      setMessages([]);
      setHistoryStatus("empty");
    } catch (unknownError) {
      const resetError = requestError(
        unknownError instanceof Error
          ? unknownError.message
          : "Conversation reset failed",
        "history-reset",
      );
      setHistoryStatus("error");
      setError(resetError);
      onErrorRef.current?.(resetError);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [
    historyResetEndpoint,
    initialConversationId,
    isStreaming,
    workspaceId,
  ]);

  const retryLastMessage = useCallback(() => {
    if (!lastUserMessage) return;
    void sendMessage(lastUserMessage, { isRetry: true });
  }, [lastUserMessage, sendMessage]);

  const dismissError = useCallback(() => {
    setError(undefined);
  }, []);

  const setModel = useCallback((nextModel: ModelSelection) => {
    setModelState(nextModel);
    setError(undefined);
    setUsage(undefined);
  }, []);

  return {
    messages,
    isStreaming,
    error,
    usage,
    model,
    setModel,
    sendMessage,
    dispatchHostCommand,
    retryLastMessage,
    dismissError,
    resetConversation,
    isHistoryLoading: isLoadingHistory,
    historyStatus,
    activeAssistantMessageId,
  };
}
