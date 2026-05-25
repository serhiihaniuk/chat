import type { ChatClient } from "@side-chat/chat-client";
import {
  SIDECHAT_PROTOCOL_VERSION,
  type ActivityEvent,
  type ChatStreamRequest,
  type CompletedEvent,
  type DeltaEvent,
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
  const toolEvents = shouldUseSearchTool(request.message.content)
    ? [
        toolRunningEvent(assistantTurnId, request.message.content),
        toolCompletedEvent(assistantTurnId, request.message.content),
      ]
    : [];
  const deltaSequence = toolEvents.length > 0 ? 4 : 2;
  const hostCommandSequence = deltaSequence + 1;
  const completedSequence = hostCommandSequence + 1;

  return [
    started(assistantTurnId),
    reasoningEvent(assistantTurnId),
    ...toolEvents,
    deltaEvent(assistantTurnId, deltaSequence, `Mock response: ${request.message.content}`),
    hostCommandEvent(assistantTurnId, hostCommandSequence),
    completedEvent(assistantTurnId, completedSequence),
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

const reasoningEvent = (assistantTurnId: string): ActivityEvent => ({
  ...baseEvent(assistantTurnId, 1),
  type: "sidechat.activity",
  activityId: "mock-reasoning",
  activityKind: "reasoning",
  status: "completed",
  title: "Mock harness selected deterministic stream",
});

const deltaEvent = (assistantTurnId: string, sequence: number, content: string): DeltaEvent => ({
  ...baseEvent(assistantTurnId, sequence),
  type: "sidechat.delta",
  content,
});

const toolRunningEvent = (assistantTurnId: string, query: string): ActivityEvent => ({
  ...baseEvent(assistantTurnId, 2),
  type: "sidechat.activity",
  activityId: "mock-tool-web-search",
  activityKind: "tool",
  status: "running",
  title: "Run mock_web_search",
  details: {
    tool: {
      toolCallId: "mock-tool-web-search",
      toolName: "mock_web_search",
      input: { query },
    },
  },
});

const toolCompletedEvent = (assistantTurnId: string, query: string): ActivityEvent => ({
  ...baseEvent(assistantTurnId, 3),
  type: "sidechat.activity",
  activityId: "mock-tool-web-search",
  activityKind: "tool",
  status: "completed",
  title: "Run mock_web_search",
  details: {
    tool: {
      toolCallId: "mock-tool-web-search",
      toolName: "mock_web_search",
      input: { query },
      result: {
        query,
        summary: `Mocked web search found briefing-style context for "${query}".`,
        results: [
          {
            title: "Mock Search Result",
            url: "https://example.test/search-result",
            snippet: "Deterministic mocked search result.",
          },
        ],
      },
      sources: [{ label: "Mock Search Result", url: "https://example.test/search-result" }],
    },
  },
});

const hostCommandEvent = (assistantTurnId: string, sequence: number): ActivityEvent => ({
  ...baseEvent(assistantTurnId, sequence),
  type: "sidechat.activity",
  activityId: "mock-command-open-resource",
  activityKind: "host_command",
  status: "running",
  title: "Open resource",
  details: {
    hostCommand: {
      commandId: "mock-command-open-resource",
      commandName: "open_resource",
      payload: { resourceType: "document", resourceId: "mock-doc" },
    },
  },
});

const completedEvent = (assistantTurnId: string, sequence: number): CompletedEvent => ({
  ...baseEvent(assistantTurnId, sequence),
  type: "sidechat.completed",
  finishReason: "stop",
});

const shouldUseSearchTool = (text: string): boolean => /\b(search|web|lookup)\b/iu.test(text);
