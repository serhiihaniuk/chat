import type { SidechatStreamEvent } from "@side-chat/chat-protocol";

import type { WidgetState } from "./conversation-state.js";
import {
  appendAssistantDelta,
  appendReasoningPart,
  fromHistoryMessage,
  upsertHostCommandPart,
  upsertToolPart,
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
        activeAssistantMessageId: event.assistantTurnId,
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
      return {
        ...state,
        messages: appendReasoningPart(state.messages, event),
        reasoning: [...state.reasoning, event.summary],
      };
    case "sidechat.tool":
      return {
        ...state,
        messages: upsertToolPart(state.messages, event),
        tools: upsertById(state.tools, event, event.toolCallId),
      };
    case "sidechat.host_command":
      return {
        ...state,
        messages: upsertHostCommandPart(state.messages, event),
        hostCommands: [...state.hostCommands, { event }],
      };
    case "sidechat.completed":
      return clearActiveAssistant(state, {
        status: "completed",
        ...(event.usage ? { usage: event.usage } : {}),
      });
    case "sidechat.error":
      return clearActiveAssistant(state, {
        status: "error",
        errorMessage: event.message,
      });
    case "sidechat.history":
      return {
        ...state,
        historyStatus: event.messages.length > 0 ? "loaded" : "empty",
        messages: event.messages.map(fromHistoryMessage),
      };
  }
};

const clearActiveAssistant = (
  state: WidgetState,
  updates: Omit<Partial<WidgetState>, "activeAssistantMessageId">,
): WidgetState => {
  const next = { ...state, ...updates };
  delete next.activeAssistantMessageId;
  return next;
};

const upsertById = <Item>(
  items: readonly Item[],
  item: Item,
  id: string,
): readonly Item[] => {
  const existing = items.findIndex((current) => readItemId(current) === id);
  if (existing === -1) return [...items, item];
  return items.map((current, index) => (index === existing ? item : current));
};

const readItemId = (item: unknown): string | undefined =>
  typeof item === "object" &&
  item !== null &&
  "toolCallId" in item &&
  typeof item.toolCallId === "string"
    ? item.toolCallId
    : undefined;
