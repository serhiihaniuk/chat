import type {
  HostCommand,
  HostCommandResult,
  SidechatStreamErrorEvent,
  SidechatStreamEvent,
  TokenUsage,
} from "@side-chat/shared-protocol";

/**
 * Pure message projection domain. It translates sidechat.v1 stream events into
 * widget message state and returns side effects separately so React/fetch logic
 * stays in adapters instead of being mixed into protocol handling.
 */
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

export type SideChatStreamEventEffect =
  | {
      kind: "started";
      activeAssistantMessageId: string;
    }
  | {
      kind: "completed";
      conversationId: string;
      fallbackUsage: TokenUsage;
    }
  | {
      kind: "error";
      error: SidechatStreamErrorEvent;
    }
  | {
      kind: "host-command";
      messageId: string;
      pendingHostCommand: WidgetHostCommandPart;
      command: HostCommand;
    }
  | {
      kind: "none";
    };

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

export const completeHostCommandPartInMessages = (
  messages: WidgetMessage[],
  messageId: string,
  completedHostCommand: WidgetHostCommandPart,
): WidgetMessage[] =>
  messages.map((message) =>
    message.id === messageId
      ? {
          ...message,
          parts: upsertHostCommandPart(message.parts, completedHostCommand),
        }
      : message,
  );

const createPendingHostCommandPart = (
  event: Extract<SidechatStreamEvent, { type: "sidechat.host_command" }>,
): WidgetHostCommandPart => ({
  id: `host-command-${event.commandId}`,
  type: "host-command",
  commandId: event.commandId,
  command: event.command,
  status: "pending",
});

const applyToolEventToMessage = (
  message: WidgetMessage,
  event: Extract<SidechatStreamEvent, { type: "sidechat.tool" }>,
): WidgetMessage => ({
  ...message,
  parts: upsertToolPart(message.parts, {
    id: `tool-${event.toolCallId}`,
    type: "tool",
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    status: event.status,
    input: event.input,
    output: event.output,
    error: event.error,
  }),
});

const applyEventToMatchingMessage = (
  messages: WidgetMessage[],
  messageId: string,
  update: (message: WidgetMessage) => WidgetMessage,
): WidgetMessage[] =>
  messages.map((message) =>
    message.id === messageId ? update(message) : message,
  );

export const applySideChatStreamEventToMessages = (
  messages: WidgetMessage[],
  event: SidechatStreamEvent,
): WidgetMessage[] => {
  switch (event.type) {
    case "sidechat.started":
      return [
        ...messages,
        { id: event.messageId, role: "assistant", content: "" },
      ];

    case "sidechat.delta":
      return applyEventToMatchingMessage(messages, event.messageId, (message) => ({
        ...message,
        content: message.content + event.content,
      }));

    case "sidechat.reasoning":
      return applyEventToMatchingMessage(messages, event.messageId, (message) => ({
        ...message,
        parts: appendReasoningPart(message.parts, event.content, event.index),
      }));

    case "sidechat.tool":
      return applyEventToMatchingMessage(messages, event.messageId, (message) =>
        applyToolEventToMessage(message, event),
      );

    case "sidechat.host_command":
      return applyEventToMatchingMessage(messages, event.messageId, (message) => ({
        ...message,
        parts: upsertHostCommandPart(
          message.parts,
          createPendingHostCommandPart(event),
        ),
      }));

    case "sidechat.completed":
      if (!event.metadata) return messages;
      return applyEventToMatchingMessage(messages, event.messageId, (message) => ({
        ...message,
        metadata: {
          ...(message.metadata ?? {}),
          ...event.metadata,
        },
      }));

    case "sidechat.history":
      return event.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        metadata: message.metadata,
      }));

    case "sidechat.error":
      return messages;
  }
};

export const getSideChatStreamEventEffect = (
  event: SidechatStreamEvent,
): SideChatStreamEventEffect => {
  switch (event.type) {
    case "sidechat.started":
      return {
        kind: "started",
        activeAssistantMessageId: event.messageId,
      };

    case "sidechat.completed":
      return {
        kind: "completed",
        conversationId: event.conversationId,
        fallbackUsage: event.usage,
      };

    case "sidechat.error":
      return {
        kind: "error",
        error: event,
      };

    case "sidechat.host_command":
      return {
        kind: "host-command",
        messageId: event.messageId,
        pendingHostCommand: createPendingHostCommandPart(event),
        command: event.command,
      };

    case "sidechat.delta":
    case "sidechat.history":
    case "sidechat.reasoning":
    case "sidechat.tool":
      return { kind: "none" };
  }
};
