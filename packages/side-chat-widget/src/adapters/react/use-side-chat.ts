import { useCallback, useEffect, useState } from "react";
import { Effect } from "effect";
import {
  parseSsePayload,
  protocolVersion,
  type HostCommand,
  type HostCommandResult,
  type HostContextSnapshot,
  type ModelSelection,
  type SidechatStreamErrorEvent,
  type SidechatStreamEvent,
  type TokenUsage,
} from "@side-chat/shared-protocol";
import { decodeKnownFramePayload } from "../../application/stream-decoding/stream-event-decoder.js";
import {
  applySideChatStreamEventToMessages,
  completeHostCommandPartInMessages,
  getSideChatStreamEventEffect,
  type WidgetMessage,
} from "../../domain/message/stream-event-state.js";

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

export type SideChatError = SidechatStreamErrorEvent;

export type UseSideChatOptions = {
  apiEndpoint: string;
  workspaceId: string;
  initialConversationId?: string;
  historyEndpoint?: string;
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

const randomId = () =>
  `client-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const deriveHistoryEndpoint = (apiEndpoint: string): string => {
  const streamSuffix = "/chat/stream";
  if (apiEndpoint.endsWith(streamSuffix)) {
    return `${apiEndpoint.slice(0, -streamSuffix.length)}/chat/history`;
  }

  return `${apiEndpoint}/chat/history`;
};

const requestError = (message: string, requestId: string): SideChatError => ({
  type: "sidechat.error",
  requestId,
  code: "REQUEST_FAILED",
  message,
  retryable: true,
});

export type CreateChatRequestPayloadInput = {
  workspaceId: string;
  conversationId?: string;
  messageId: string;
  content: string;
  model: ModelSelection;
  hostContext?: HostContextSnapshot;
};

export const createChatRequestPayload = ({
  workspaceId,
  conversationId,
  messageId,
  content,
  model,
  hostContext,
}: CreateChatRequestPayloadInput) => ({
  workspaceId,
  conversationId,
  message: { id: messageId, role: "user" as const, content },
  model,
  ...(hostContext ? { hostContext } : {}),
});

const knownEventTypes = new Set([
  "sidechat.started",
  "sidechat.delta",
  "sidechat.reasoning",
  "sidechat.tool",
  "sidechat.host_command",
  "sidechat.completed",
  "sidechat.error",
  "sidechat.history",
]);

const parseKnownFramePayload = (
  data: string,
): SidechatStreamEvent | undefined => {
  return Effect.runSync(decodeKnownFramePayload(data));
};

const deriveUsageEndpoint = (apiEndpoint: string): string => {
  const streamSuffix = "/chat/stream";
  if (apiEndpoint.endsWith(streamSuffix)) {
    return `${apiEndpoint.slice(0, -streamSuffix.length)}/chat/usage`;
  }

  return `${apiEndpoint}/chat/usage`;
};

export const readSideChatStreamEvents = async (
  response: globalThis.Response,
  onEvent: (event: SidechatStreamEvent) => void,
  onMalformedEvent?: (message: string) => void,
): Promise<void> => {
  let terminalSeen = false;
  const emit = (chunk: string) => {
    for (const payload of parseSsePayload(chunk)) {
      if (payload.event && !knownEventTypes.has(payload.event)) {
        continue;
      }

      const parsed = parseKnownFramePayload(payload.data);
      if (parsed) {
        if (terminalSeen) {
          onMalformedEvent?.(
            `Ignored ${parsed.type} after terminal sidechat stream event`,
          );
          continue;
        }

        onEvent(parsed);
        terminalSeen =
          parsed.type === "sidechat.completed" ||
          parsed.type === "sidechat.error";
        continue;
      }

      onMalformedEvent?.(
        `Malformed ${payload.event ?? "sidechat"} stream event`,
      );
    }
  };

  if (!response.body) {
    emit(await response.text());
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  const flushCompleteFrames = () => {
    for (;;) {
      const boundary = pending.indexOf("\n\n");
      if (boundary === -1) return;

      const frame = pending.slice(0, boundary + 2);
      pending = pending.slice(boundary + 2);
      emit(frame);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    pending += decoder.decode(value, { stream: true });
    flushCompleteFrames();
  }

  pending += decoder.decode();
  if (pending.trim()) {
    emit(pending.endsWith("\n\n") ? pending : `${pending}\n\n`);
  }
};

export function useSideChat(options: UseSideChatOptions) {
  const {
    apiEndpoint,
    workspaceId,
    initialConversationId,
    historyEndpoint: explicitHistoryEndpoint,
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
  const historyEndpoint =
    explicitHistoryEndpoint ?? deriveHistoryEndpoint(apiEndpoint);
  const usageEndpoint = deriveUsageEndpoint(apiEndpoint);

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
        onUsage?.(payload.usage);
      }
    },
    [onUsage, usageEndpoint, workspaceId],
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
        onError?.(historyError);
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
    onError,
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
            onUsage?.(effect.fallbackUsage);
          });
          return;

        case "error":
          setActiveAssistantMessageId(undefined);
          setError(effect.error);
          onError?.(effect.error);
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
    [dispatchHostCommand, onError, onUsage, refreshUsage],
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
          body: JSON.stringify(createChatRequestPayload({
            workspaceId,
            conversationId: initialConversationId,
            messageId,
            content: trimmed,
            model,
            hostContext,
          })),
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
        onError?.(nextError);
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
      onError,
      workspaceId,
    ],
  );

  const retryLastMessage = useCallback(() => {
    if (!lastUserMessage) return;
    void sendMessage(lastUserMessage, { isRetry: true });
  }, [lastUserMessage, sendMessage]);

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
    isHistoryLoading: isLoadingHistory,
    historyStatus,
    activeAssistantMessageId,
  };
}
