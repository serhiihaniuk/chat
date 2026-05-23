import {
  encodeSseEvent,
  SIDECHAT_PROTOCOL_VERSION,
  type ChatStreamRequest,
  type CompletedEvent,
  type DeltaEvent,
  type SidechatStreamEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";

export const buildChatStreamRequest = (
  content = "hello",
): ChatStreamRequest => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "test-request-1",
  message: {
    id: "test-message-1",
    role: "user",
    content,
  },
});

export const buildStartedEvent = (sequence = 0): StartedEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.started",
  eventId: `test-event-${sequence}`,
  assistantTurnId: "test-turn-1",
  sequence,
  createdAt: "2026-05-23T00:00:00.000Z",
  conversationId: "test-conversation-1",
});

export const buildDeltaEvent = (
  content = "hello",
  sequence = 1,
): DeltaEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.delta",
  eventId: `test-event-${sequence}`,
  assistantTurnId: "test-turn-1",
  sequence,
  createdAt: "2026-05-23T00:00:01.000Z",
  content,
});

export const buildCompletedEvent = (sequence = 2): CompletedEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.completed",
  eventId: `test-event-${sequence}`,
  assistantTurnId: "test-turn-1",
  sequence,
  createdAt: "2026-05-23T00:00:02.000Z",
  finishReason: "stop",
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
});

export const buildSuccessStreamEvents = (
  content = "hello",
): readonly SidechatStreamEvent[] => [
  buildStartedEvent(0),
  buildDeltaEvent(content, 1),
  buildCompletedEvent(2),
];

export const encodeMockSseStream = (
  events: readonly SidechatStreamEvent[],
): string => events.map(encodeSseEvent).join("");

export const collectAsyncIterable = async <T>(
  items: AsyncIterable<T>,
): Promise<T[]> => {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
};

export const assertTerminalStream = (
  events: readonly SidechatStreamEvent[],
): void => {
  const terminal = events.filter(
    (event) =>
      event.type === "sidechat.completed" || event.type === "sidechat.error",
  );
  if (terminal.length !== 1) {
    throw new Error(
      `Expected one terminal event, received ${terminal.length}.`,
    );
  }
};

export const createMockChatResponse = (
  events: readonly SidechatStreamEvent[] = buildSuccessStreamEvents(),
): Response =>
  new Response(encodeMockSseStream(events), {
    headers: { "content-type": "text/event-stream" },
  });
