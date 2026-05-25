import type { ChatClient } from "@side-chat/chat-client";
import {
  SIDECHAT_PROTOCOL_VERSION,
  type ChatStreamRequest,
  type CompletedEvent,
  type DeltaEvent,
  type HostCommandEvent,
  type ReasoningEvent,
  type SidechatStreamEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";

export const createMockStreamClient = (): ChatClient => ({
  streamChat: (request) =>
    Promise.resolve({
      attempt: 1,
      events: mockStreamEvents(request),
    }),
});

const mockStreamEvents = async function* (
  request: ChatStreamRequest,
): AsyncIterable<SidechatStreamEvent> {
  for (const event of createMockEvents(request)) {
    await Promise.resolve();
    yield event;
  }
};

export const createMockEvents = (request: ChatStreamRequest): readonly SidechatStreamEvent[] => {
  const assistantTurnId = `turn-${request.requestId}`;
  return [
    started(assistantTurnId),
    reasoningEvent(assistantTurnId),
    deltaEvent(assistantTurnId, `Mock response: ${request.message.content}`),
    hostCommandEvent(assistantTurnId),
    completedEvent(assistantTurnId),
  ];
};

const baseEvent = (assistantTurnId: string, sequence: number) => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  eventId: `mock-event-${sequence}`,
  assistantTurnId,
  sequence,
  createdAt: "2026-05-23T14:00:00.000Z",
});

const started = (assistantTurnId: string): StartedEvent => ({
  ...baseEvent(assistantTurnId, 0),
  type: "sidechat.started",
  conversationId: "mock-conversation",
});

const reasoningEvent = (assistantTurnId: string): ReasoningEvent => ({
  ...baseEvent(assistantTurnId, 1),
  type: "sidechat.reasoning",
  summary: "mock harness selected deterministic stream",
});

const deltaEvent = (assistantTurnId: string, content: string): DeltaEvent => ({
  ...baseEvent(assistantTurnId, 2),
  type: "sidechat.delta",
  content,
});

const hostCommandEvent = (assistantTurnId: string): HostCommandEvent => ({
  ...baseEvent(assistantTurnId, 3),
  type: "sidechat.host_command",
  commandId: "mock-command-open-resource",
  commandName: "open_resource",
  payload: { resourceType: "document", resourceId: "mock-doc" },
});

const completedEvent = (assistantTurnId: string): CompletedEvent => ({
  ...baseEvent(assistantTurnId, 4),
  type: "sidechat.completed",
  finishReason: "stop",
});
