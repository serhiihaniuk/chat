import {
  SIDECHAT_PROTOCOL_VERSION,
  type CompletedEvent,
  type DeltaEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";

/**
 * Protocol event builders shared by widget DOM/model tests.
 *
 * These produce `sidechat.v1` event fixtures with sensible default sequences so a
 * test only overrides what it asserts on. They live with the chat entity
 * (alongside its message model) and are re-exported through the `./testing`
 * entry, not shipped in production widget code.
 */
export const baseEvent = (sequence: number) => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  eventId: `event-${sequence}`,
  assistantTurnId: "turn-1",
  sequence,
  createdAt: "2026-05-23T13:00:00.000Z",
});

export const started = (conversationId = "conversation-1"): StartedEvent => ({
  ...baseEvent(0),
  type: "sidechat.started",
  conversationId,
});

export const delta = (content: string, sequence = 1): DeltaEvent => ({
  ...baseEvent(sequence),
  type: "sidechat.delta",
  content,
});

export const completed = (sequence = 2): CompletedEvent => ({
  ...baseEvent(sequence),
  type: "sidechat.completed",
  finishReason: "stop",
});
