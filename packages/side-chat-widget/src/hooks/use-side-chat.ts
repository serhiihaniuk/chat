import { useCallback, useEffect, useState } from "react";
import {
  parseSsePayload,
  protocolVersion,
  SidechatStreamEventSchema,
  type HostCommand,
  type HostCommandResult,
  type HostContextSnapshot,
  type ModelSelection,
  type SidechatStreamErrorEvent,
  type SidechatStreamEvent,
  type TokenUsage,
} from "@side-chat/shared-protocol";

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

export type WidgetMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
  parts?: WidgetMessagePart[];
};

export type WidgetReasoningPart = {
  id: string;
  type: "reasoning";
  content: string;
};

export type WidgetToolPart = {
  id: string;
  type: "tool";
  toolCallId: string;
  toolName: string;
  status: "running" | "completed" | "error";
  input?: unknown;
  output?: unknown;
  error?: string;
};

export type WidgetHostCommandPart = {
  id: string;
  type: "host-command";
  commandId: string;
  command: HostCommand;
  status: "pending" | HostCommandResult["status"];
  result?: HostCommandResult;
};

export type WidgetMessagePart =
  | WidgetReasoningPart
  | WidgetToolPart
  | WidgetHostCommandPart;

const randomId = () =>
  `client-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export const appendReasoningPart = (
  parts: WidgetMessagePart[] | undefined,
  content: string,
  index: number,
): WidgetMessagePart[] => {
  const current = parts ?? [];
  const lastPart = current.at(-1);

  if (lastPart?.type === "reasoning") {
    return [
      ...current.slice(0, -1),
      { ...lastPart, content: lastPart.content + content },
    ];
  }

  return [
    ...current,
    {
      id: `reasoning-${index}-${current.length}`,
      type: "reasoning",
      content,
    },
  ];
};

export const upsertToolPart = (
  parts: WidgetMessagePart[] | undefined,
  tool: WidgetToolPart,
): WidgetMessagePart[] => {
  const current = parts ?? [];
  const existingIndex = current.findIndex(
    (part) => part.type === "tool" && part.toolCallId === tool.toolCallId,
  );

  if (existingIndex === -1) {
    return [...current, tool];
  }

  return current.map((part, index) =>
    index === existingIndex ? { ...tool, id: part.id } : part,
  );
};

export const upsertHostCommandPart = (
  parts: WidgetMessagePart[] | undefined,
  hostCommand: WidgetHostCommandPart,
): WidgetMessagePart[] => {
  const current = parts ?? [];
  const existingIndex = current.findIndex(
    (part) =>
      part.type === "host-command" &&
      part.commandId === hostCommand.commandId,
  );

  if (existingIndex === -1) {
    return [...current, hostCommand];
  }

  return current.map((part, index) =>
    index === existingIndex ? { ...hostCommand, id: part.id } : part,
  );
};

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
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return undefined;
  }

  const parsed = SidechatStreamEventSchema.safeParse(json);
  if (parsed.success) return parsed.data;

  if (
    typeof json === "object" &&
    json !== null &&
    "type" in json &&
    json.type === "sidechat.reasoning" &&
    "requestId" in json &&
    typeof json.requestId === "string" &&
    "messageId" in json &&
    typeof json.messageId === "string" &&
    "content" in json
  ) {
    return {
      type: "sidechat.reasoning",
      requestId: json.requestId,
      messageId: json.messageId,
      content:
        typeof json.content === "string"
          ? json.content
          : JSON.stringify(json.content),
      index: "index" in json && typeof json.index === "number" ? json.index : 0,
    };
  }

  return undefined;
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
      if (event.type === "sidechat.started") {
        setActiveAssistantMessageId(event.messageId);
        setMessages((current) => [
          ...current,
          { id: event.messageId, role: "assistant", content: "" },
        ]);
        return;
      }

      if (event.type === "sidechat.delta") {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.messageId
              ? { ...message, content: message.content + event.content }
              : message,
          ),
        );
        return;
      }

      if (event.type === "sidechat.reasoning") {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.messageId
              ? {
                  ...message,
                  parts: appendReasoningPart(
                    message.parts,
                    event.content,
                    event.index,
                  ),
                }
              : message,
          ),
        );
        return;
      }

      if (event.type === "sidechat.tool") {
        setMessages((current) =>
          current.map((message) => {
            if (message.id !== event.messageId) return message;

            const nextTool: WidgetToolPart = {
              id: `tool-${event.toolCallId}`,
              type: "tool",
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              status: event.status,
              input: event.input,
              output: event.output,
              error: event.error,
            };

            return {
              ...message,
              parts: upsertToolPart(message.parts, nextTool),
            };
          }),
        );
        return;
      }

      if (event.type === "sidechat.host_command") {
        const pendingHostCommand: WidgetHostCommandPart = {
          id: `host-command-${event.commandId}`,
          type: "host-command",
          commandId: event.commandId,
          command: event.command,
          status: "pending",
        };

        setMessages((current) =>
          current.map((message) =>
            message.id === event.messageId
              ? {
                  ...message,
                  parts: upsertHostCommandPart(
                    message.parts,
                    pendingHostCommand,
                  ),
                }
              : message,
          ),
        );

        void dispatchHostCommand(event.command).then((result) => {
          const completedHostCommand: WidgetHostCommandPart = {
            ...pendingHostCommand,
            status: result.status,
            result,
          };

          setMessages((current) =>
            current.map((message) =>
              message.id === event.messageId
                ? {
                    ...message,
                    parts: upsertHostCommandPart(
                      message.parts,
                      completedHostCommand,
                    ),
                  }
                : message,
            ),
          );
        });
        return;
      }

      if (event.type === "sidechat.completed") {
        if (event.metadata) {
          setMessages((current) =>
            current.map((message) =>
              message.id === event.messageId
                ? {
                    ...message,
                    metadata: {
                      ...(message.metadata ?? {}),
                      ...event.metadata,
                    },
                  }
                : message,
            ),
          );
        }
        setActiveAssistantMessageId(undefined);
        setError(undefined);
        void refreshUsage(event.conversationId).catch(() => {
          setUsage(event.usage);
          onUsage?.(event.usage);
        });
        return;
      }

      if (event.type === "sidechat.error") {
        setActiveAssistantMessageId(undefined);
        setError(event);
        onError?.(event);
        return;
      }

      if (event.type !== "sidechat.history") return;

      setMessages(
        event.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          metadata: message.metadata,
        })),
      );
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
