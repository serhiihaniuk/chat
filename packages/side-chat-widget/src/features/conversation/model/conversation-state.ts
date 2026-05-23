import type {
  ChatStreamRequest,
  SidechatStreamEvent,
} from "@side-chat/chat-protocol";

import type { HostCommandResult } from "@side-chat/host-bridge";

import { applyStreamEvent } from "./stream-event-reducer.js";
import { fromRequestMessage } from "#entities/message/projection";
import type { WidgetMessage } from "#entities/message/model";
import type { WidgetHostCommand } from "#entities/host-command/model";
import type { WidgetTool } from "#entities/tool/model";

export type WidgetStatus = "idle" | "streaming" | "completed" | "error";

export type WidgetState = {
  readonly status: WidgetStatus;
  readonly conversationId?: string;
  readonly assistantTurnId?: string;
  readonly messages: readonly WidgetMessage[];
  readonly reasoning: readonly string[];
  readonly tools: readonly WidgetTool[];
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
      fromRequestMessage(request, state.messages.length),
    ],
    reasoning: state.reasoning,
    tools: state.tools,
    hostCommands: state.hostCommands,
  };
};

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
