import {
  SIDECHAT_PROTOCOL_VERSION,
  type ChatStreamRequest,
  type HostCommandEvent,
  type HostContext,
  type ToolEvent,
  type UsageMetadata,
} from "@side-chat/chat-protocol";
import type { HostCommandResult } from "@side-chat/host-bridge";

export type WidgetStatus = "idle" | "submitted" | "streaming" | "error";
export type WidgetUsage = UsageMetadata;

export type WidgetMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly thoughts: readonly WidgetThought[];
  readonly reasoning: readonly string[];
  readonly tools: readonly ToolEvent[];
  readonly hostCommands: readonly HostCommandView[];
  readonly isStreaming?: boolean;
};

export type WidgetReasoningThought = {
  readonly kind: "reasoning";
  readonly id: string;
  readonly sequence: number;
  readonly content: string;
};

export type WidgetToolThought = {
  readonly kind: "tool";
  readonly id: string;
  readonly sequence: number;
  readonly tool: ToolEvent;
};

export type WidgetHostCommandThought = {
  readonly kind: "host-command";
  readonly id: string;
  readonly sequence: number;
  readonly command: HostCommandView;
};

export type WidgetThought = WidgetReasoningThought | WidgetToolThought | WidgetHostCommandThought;

export type HostCommandView = {
  readonly event: HostCommandEvent;
  readonly result?: HostCommandResult;
  readonly status: "running" | "completed" | "failed";
};

export const createDefaultRequest = ({
  assistantProfileId,
  content,
  hostContext,
  messageId,
  requestId,
}: {
  readonly assistantProfileId: string | undefined;
  readonly content: string;
  readonly hostContext: HostContext | undefined;
  readonly messageId: string;
  readonly requestId: string;
}): ChatStreamRequest => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId,
  ...(assistantProfileId ? { assistantProfileId } : {}),
  message: {
    id: messageId,
    role: "user",
    content,
  },
  ...(hostContext ? { hostContext } : {}),
});

export const createWidgetMessage = (
  id: string,
  role: WidgetMessage["role"],
  content: string,
  isStreaming = false,
): WidgetMessage => ({
  id,
  role,
  content,
  thoughts: [],
  reasoning: [],
  tools: [],
  hostCommands: [],
  isStreaming,
});

export const updateMessage = (
  messages: readonly WidgetMessage[],
  id: string,
  update: (message: WidgetMessage) => WidgetMessage,
): WidgetMessage[] => messages.map((message) => (message.id === id ? update(message) : message));

export const updateHostCommand = (
  messages: readonly WidgetMessage[],
  messageId: string,
  commandId: string,
  nextCommand: HostCommandView,
): WidgetMessage[] =>
  updateMessage(messages, messageId, (message) => ({
    ...message,
    hostCommands: message.hostCommands.map((command) =>
      command.event.commandId === commandId ? nextCommand : command,
    ),
    thoughts: message.thoughts.map((thought) =>
      thought.kind === "host-command" && thought.command.event.commandId === commandId
        ? { ...thought, command: nextCommand }
        : thought,
    ),
  }));

export const upsertToolEvent = (tools: readonly ToolEvent[], event: ToolEvent): ToolEvent[] => {
  const index = tools.findIndex((tool) => tool.toolCallId === event.toolCallId);
  if (index < 0) return [...tools, event];
  return tools.map((tool, currentIndex) => (currentIndex === index ? { ...tool, ...event } : tool));
};

export const appendReasoningThought = (
  thoughts: readonly WidgetThought[],
  event: { readonly eventId: string; readonly sequence: number; readonly summary: string },
): WidgetThought[] => [
  ...thoughts,
  {
    content: event.summary,
    id: event.eventId,
    kind: "reasoning",
    sequence: event.sequence,
  },
];

export const upsertToolThought = (
  thoughts: readonly WidgetThought[],
  event: ToolEvent,
): WidgetThought[] => {
  const index = thoughts.findIndex(
    (thought) => thought.kind === "tool" && thought.tool.toolCallId === event.toolCallId,
  );
  if (index < 0) {
    return [
      ...thoughts,
      {
        id: event.toolCallId,
        kind: "tool",
        sequence: event.sequence,
        tool: event,
      },
    ];
  }

  return thoughts.map((thought, currentIndex) =>
    currentIndex === index && thought.kind === "tool"
      ? {
          ...thought,
          tool: { ...thought.tool, ...event },
        }
      : thought,
  );
};

export const appendHostCommandThought = (
  thoughts: readonly WidgetThought[],
  command: HostCommandView,
): WidgetThought[] => [
  ...thoughts,
  {
    command,
    id: command.event.commandId,
    kind: "host-command",
    sequence: command.event.sequence,
  },
];

export const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Chat request failed";

export const createId = (prefix: string): string => {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
};
