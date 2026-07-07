import type { HistoryMessage } from "@side-chat/chat-protocol";

import type { ReadHistoryResult } from "#entities/conversation";
import {
  applyActivityEvent,
  completeActivityTimeline,
  createEmptyActivityTimeline,
  createWidgetMessage,
  type WidgetMessage,
} from "#entities/chat";

export const toWidgetHistoryMessages = (history: ReadHistoryResult): readonly WidgetMessage[] =>
  history.messages.flatMap((message) =>
    message.role === "user" || message.role === "assistant"
      ? [toWidgetHistoryMessage(message, message.role)]
      : [],
  );

// A stored transcript message, with the turn's persisted activity trace folded
// through the SAME reducer the live stream uses — so a reloaded conversation
// shows the thinking exactly as it rendered live. The trace is only present
// when the service persists turn activity; without it the timeline stays empty.
const toWidgetHistoryMessage = (
  message: HistoryMessage,
  role: "user" | "assistant",
): WidgetMessage => {
  const base = createWidgetMessage(message.id, role, message.content);
  const events = message.activity;
  if (!events || events.length === 0) return base;

  const folded = events.reduce(applyActivityEvent, createEmptyActivityTimeline());
  // The stored trace has no terminal event; the last activity's timestamp is the
  // honest end of the thinking window (and settles any stray running spinner).
  return { ...base, activity: completeActivityTimeline(folded, events.at(-1)?.createdAt) };
};
