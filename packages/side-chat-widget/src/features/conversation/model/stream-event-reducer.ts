import type { SidechatStreamEvent } from "@side-chat/chat-protocol";

import type { WidgetState } from "./conversation-state.js";
import {
  appendAssistantDelta,
  fromHistoryMessage,
} from "#entities/message/projection";

export const applyStreamEvent = (
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
