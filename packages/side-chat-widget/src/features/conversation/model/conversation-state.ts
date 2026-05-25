import type {
  ChatStreamRequest,
  SidechatStreamEvent,
  UsageMetadata,
} from "@side-chat/chat-protocol";

import type { HostCommandResult } from "@side-chat/host-bridge";

import { applyStreamEvent } from "./stream-event-reducer.js";
import {
  completeHostCommandPart,
  fromRequestMessage,
} from "#entities/message/projection";
import type { WidgetMessage } from "#entities/message/model";
import type { WidgetHostCommand } from "#entities/host-command/model";
import type { WidgetTool } from "#entities/tool/model";

export type WidgetStatus = "idle" | "streaming" | "completed" | "error";
export type HistoryStatus = "empty" | "error" | "idle" | "loaded" | "loading";

export type WidgetState = {
  readonly activeAssistantMessageId?: string;
  readonly status: WidgetStatus;
  readonly conversationId?: string;
  readonly assistantTurnId?: string;
  readonly errorMessage?: string;
  readonly historyStatus: HistoryStatus;
  readonly lastUserMessage?: string;
  readonly messages: readonly WidgetMessage[];
  readonly reasoning: readonly string[];
  readonly tools: readonly WidgetTool[];
  readonly hostCommands: readonly WidgetHostCommand[];
  readonly usage?: UsageMetadata;
};

export type WidgetAction =
  | {
      readonly displayContent?: string;
      readonly request: ChatStreamRequest;
      readonly type: "submit";
    }
  | { readonly message: string; readonly type: "history_failed" }
  | { readonly type: "history_loading" }
  | {
      readonly conversationId: string;
      readonly messages: readonly WidgetMessage[];
      readonly type: "history_loaded";
    }
  | { readonly type: "stream_event"; readonly event: SidechatStreamEvent }
  | { readonly type: "host_command_result"; readonly result: HostCommandResult }
  | { readonly type: "reset" }
  | { readonly type: "stream_failed"; readonly message: string }
  | { readonly type: "error_dismissed" }
  | { readonly type: "usage_loaded"; readonly usage: UsageMetadata };

export const initialWidgetState: WidgetState = {
  historyStatus: "idle",
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
  const handler = widgetActionHandlers[action.type] as WidgetActionHandler;
  return handler(state, action);
};

type WidgetActionType = WidgetAction["type"];
type WidgetActionFor<TType extends WidgetActionType> = Extract<
  WidgetAction,
  { readonly type: TType }
>;
type WidgetActionHandler<TAction extends WidgetAction = WidgetAction> = (
  state: WidgetState,
  action: TAction,
) => WidgetState;

const widgetActionHandlers: {
  readonly [TType in WidgetActionType]: WidgetActionHandler<
    WidgetActionFor<TType>
  >;
} = {
  error_dismissed: (state) => dismissError(state),
  history_failed: (state, action) => ({
    ...state,
    errorMessage: action.message,
    historyStatus: "error",
    status: "error",
  }),
  history_loaded: (state, action) => ({
    ...state,
    conversationId: action.conversationId,
    historyStatus: action.messages.length > 0 ? "loaded" : "empty",
    messages: action.messages,
  }),
  history_loading: (state) => ({ ...state, historyStatus: "loading" }),
  host_command_result: (state, action) =>
    applyHostCommandResult(state, action.result),
  reset: (state) => ({
    ...initialWidgetState,
    historyStatus: "empty",
    ...(state.conversationId ? { conversationId: state.conversationId } : {}),
  }),
  stream_event: (state, action) => applyStreamEvent(state, action.event),
  stream_failed: (state, action) => ({
    ...state,
    errorMessage: action.message,
    status: "error",
  }),
  submit: (state, action) =>
    submitMessage(state, action.request, action.displayContent),
  usage_loaded: (state, action) => ({ ...state, usage: action.usage }),
};

const submitMessage = (
  state: WidgetState,
  request: ChatStreamRequest,
  displayContent: string | undefined,
): WidgetState => {
  const displayRequest = displayContent
    ? {
        ...request,
        message: { ...request.message, content: displayContent },
      }
    : request;
  return {
    status: "streaming",
    ...(state.conversationId ? { conversationId: state.conversationId } : {}),
    ...(state.assistantTurnId
      ? { assistantTurnId: state.assistantTurnId }
      : {}),
    historyStatus: state.historyStatus,
    lastUserMessage: request.message.content,
    messages: [
      ...state.messages,
      fromRequestMessage(displayRequest, state.messages.length),
    ],
    reasoning: state.reasoning,
    tools: state.tools,
    hostCommands: state.hostCommands,
    ...(state.usage ? { usage: state.usage } : {}),
  };
};

const dismissError = (state: WidgetState): WidgetState => {
  return {
    historyStatus: state.historyStatus,
    hostCommands: state.hostCommands,
    messages: state.messages,
    reasoning: state.reasoning,
    status: state.status,
    tools: state.tools,
    ...(state.activeAssistantMessageId
      ? { activeAssistantMessageId: state.activeAssistantMessageId }
      : {}),
    ...(state.assistantTurnId
      ? { assistantTurnId: state.assistantTurnId }
      : {}),
    ...(state.conversationId ? { conversationId: state.conversationId } : {}),
    ...(state.lastUserMessage
      ? { lastUserMessage: state.lastUserMessage }
      : {}),
    ...(state.usage ? { usage: state.usage } : {}),
  };
};

const applyHostCommandResult = (
  state: WidgetState,
  result: HostCommandResult,
): WidgetState => ({
  ...state,
  messages: completeHostCommandPart(state.messages, result),
  hostCommands: state.hostCommands.map((command) =>
    command.event.commandId === result.commandId
      ? { ...command, result }
      : command,
  ),
});
