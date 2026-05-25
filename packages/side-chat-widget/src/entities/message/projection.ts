import type {
  ChatStreamRequest,
  HistoryMessage,
  HostCommandEvent,
  ReasoningEvent,
  ToolEvent,
} from "@side-chat/chat-protocol";
import type { HostCommandResult } from "@side-chat/host-bridge";

import type {
  WidgetHostCommandPart,
  WidgetMessage,
  WidgetMessagePart,
  WidgetReasoningPart,
  WidgetToolPart,
} from "./model.js";

export const fromRequestMessage = (
  request: ChatStreamRequest,
  sequence: number,
): WidgetMessage => ({
  content: request.message.content,
  id: request.message.id,
  role: request.message.role,
  sequence,
});

export const fromHistoryMessage = (message: HistoryMessage): WidgetMessage => ({
  content: message.content,
  id: message.id,
  role: message.role,
  sequence: message.sequence,
});

export const appendAssistantDelta = (
  messages: readonly WidgetMessage[],
  content: string,
): readonly WidgetMessage[] => {
  const last = messages.at(-1);
  if (last?.role === "assistant") {
    return [
      ...messages.slice(0, -1),
      { ...last, content: `${last.content}${content}` },
    ];
  }

  return [...messages, createAssistantMessage(messages.length, content)];
};

export const appendReasoningPart = (
  messages: readonly WidgetMessage[],
  event: ReasoningEvent,
): readonly WidgetMessage[] =>
  appendAssistantPart(messages, {
    content: event.summary,
    id: `${event.assistantTurnId}:${event.sequence}:reasoning`,
    type: "reasoning",
  });

export const upsertToolPart = (
  messages: readonly WidgetMessage[],
  event: ToolEvent,
): readonly WidgetMessage[] =>
  upsertAssistantPart(messages, {
    id: event.toolCallId,
    ...(event.errorCode ? { error: event.errorCode } : {}),
    ...(event.result ? { output: event.result } : {}),
    status: event.status,
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    type: "tool",
  });

export const upsertHostCommandPart = (
  messages: readonly WidgetMessage[],
  event: HostCommandEvent,
): readonly WidgetMessage[] =>
  upsertAssistantPart(messages, {
    commandId: event.commandId,
    commandName: event.commandName,
    id: event.commandId,
    payload: event.payload,
    status: "pending",
    type: "host-command",
  });

export const completeHostCommandPart = (
  messages: readonly WidgetMessage[],
  result: HostCommandResult,
): readonly WidgetMessage[] =>
  messages.map((message) =>
    message.parts
      ? {
          ...message,
          parts: message.parts.map((part) => completePart(part, result)),
        }
      : message,
  );

const createAssistantMessage = (
  sequence: number,
  content = "",
): WidgetMessage => ({
  content,
  id: `assistant-${sequence}`,
  role: "assistant",
  sequence,
});

const appendAssistantPart = (
  messages: readonly WidgetMessage[],
  part: WidgetReasoningPart,
): readonly WidgetMessage[] => {
  const [head, assistant] = splitAssistant(messages);
  return [...head, { ...assistant, parts: [...(assistant.parts ?? []), part] }];
};

const upsertAssistantPart = (
  messages: readonly WidgetMessage[],
  part: WidgetToolPart | WidgetHostCommandPart,
): readonly WidgetMessage[] => {
  const [head, assistant] = splitAssistant(messages);
  const parts = assistant.parts ?? [];
  const exists = parts.some((current) => current.id === part.id);
  return [
    ...head,
    {
      ...assistant,
      parts: exists
        ? parts.map((current) => (current.id === part.id ? part : current))
        : [...parts, part],
    },
  ];
};

const splitAssistant = (
  messages: readonly WidgetMessage[],
): readonly [readonly WidgetMessage[], WidgetMessage] => {
  const last = messages.at(-1);
  if (last?.role === "assistant") return [messages.slice(0, -1), last];
  return [messages, createAssistantMessage(messages.length)];
};

const completePart = (
  part: WidgetMessagePart,
  result: HostCommandResult,
): WidgetMessagePart => {
  if (part.type !== "host-command" || part.commandId !== result.commandId) {
    return part;
  }
  return {
    ...part,
    resultCode: result.resultCode,
    status: mapHostResultStatus(result.status),
  };
};

const mapHostResultStatus = (
  status: HostCommandResult["status"],
): WidgetHostCommandPart["status"] => {
  if (
    status === "applied" ||
    status === "rejected" ||
    status === "unsupported"
  ) {
    return status;
  }
  return "failed";
};
