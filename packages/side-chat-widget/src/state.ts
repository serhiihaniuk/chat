import type {
  ChatStreamRequest,
  HostCommandEvent,
  HistoryMessage,
  SidechatStreamEvent,
  ToolEvent,
} from "../../chat-protocol/src/index.js";

import type { HostCommandResult } from "../../host-bridge/src/index.js";

export type WidgetMessage = {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly sequence: number;
};

export type WidgetHostCommand = {
  readonly event: HostCommandEvent;
  readonly result?: HostCommandResult;
};

export type WidgetStatus = "idle" | "streaming" | "completed" | "error";

export type WidgetState = {
  readonly status: WidgetStatus;
  readonly conversationId?: string;
  readonly assistantTurnId?: string;
  readonly messages: readonly WidgetMessage[];
  readonly reasoning: readonly string[];
  readonly tools: readonly ToolEvent[];
  readonly hostCommands: readonly WidgetHostCommand[];
  readonly errorMessage?: string;
};

export type WidgetAction =
  | { readonly type: "submit"; readonly request: ChatStreamRequest }
  | { readonly type: "stream_event"; readonly event: SidechatStreamEvent }
  | { readonly type: "host_command_result"; readonly result: HostCommandResult }
  | { readonly type: "stream_failed"; readonly message: string };

export const initialWidgetState: WidgetState = {
  status: "idle",
  messages: [],
  reasoning: [],
  tools: [],
  hostCommands: [],
};

export const sideChatReducer = (
  state: WidgetState,
  action: WidgetAction,
): WidgetState => {
  switch (action.type) {
    case "submit":
      return submitMessage(state, action.request);
    case "stream_event":
      return applyStreamEvent(state, action.event);
    case "host_command_result":
      return applyHostCommandResult(state, action.result);
    case "stream_failed":
      return { ...state, status: "error", errorMessage: action.message };
  }
};

const submitMessage = (
  state: WidgetState,
  request: ChatStreamRequest,
): WidgetState => {
  return {
    status: "streaming",
    ...(state.conversationId ? { conversationId: state.conversationId } : {}),
    ...(state.assistantTurnId
      ? { assistantTurnId: state.assistantTurnId }
      : {}),
    messages: [
      ...state.messages,
      {
        id: request.message.id,
        role: request.message.role,
        content: request.message.content,
        sequence: state.messages.length,
      },
    ],
    reasoning: state.reasoning,
    tools: state.tools,
    hostCommands: state.hostCommands,
  };
};

const applyStreamEvent = (
  state: WidgetState,
  event: SidechatStreamEvent,
): WidgetState => {
  switch (event.type) {
    case "sidechat.started":
      return {
        ...state,
        status: "streaming",
        assistantTurnId: event.assistantTurnId,
        ...(event.conversationId
          ? { conversationId: event.conversationId }
          : {}),
      };
    case "sidechat.delta":
      return {
        ...state,
        messages: appendAssistantDelta(state.messages, event.content),
      };
    case "sidechat.reasoning":
      return { ...state, reasoning: [...state.reasoning, event.summary] };
    case "sidechat.tool":
      return { ...state, tools: [...state.tools, event] };
    case "sidechat.host_command":
      return {
        ...state,
        hostCommands: [...state.hostCommands, { event }],
      };
    case "sidechat.completed":
      return { ...state, status: "completed" };
    case "sidechat.error":
      return { ...state, status: "error", errorMessage: event.message };
    case "sidechat.history":
      return { ...state, messages: event.messages.map(fromHistoryMessage) };
  }
};

const appendAssistantDelta = (
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

  return [
    ...messages,
    {
      id: `assistant-${messages.length}`,
      role: "assistant",
      content,
      sequence: messages.length,
    },
  ];
};

const fromHistoryMessage = (message: HistoryMessage): WidgetMessage => ({
  id: message.id,
  role: message.role,
  content: message.content,
  sequence: message.sequence,
});

const applyHostCommandResult = (
  state: WidgetState,
  result: HostCommandResult,
): WidgetState => ({
  ...state,
  hostCommands: state.hostCommands.map((command) =>
    command.event.commandId === result.commandId
      ? { ...command, result }
      : command,
  ),
});
