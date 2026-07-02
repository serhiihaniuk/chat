import {
  SIDECHAT_PROTOCOL_VERSION,
  type ActivityEvent,
  type ChatStreamRequest,
  type CompletedEvent,
  type DeltaEvent,
  type SidechatStreamEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";
import type { SideChatApiClient } from "@side-chat/side-chat-widget";
import type { WidgetHarnessConfig } from "#config/modes";

type MockRun = {
  readonly requestId: string;
  readonly conversationId: string;
  readonly events: readonly SidechatStreamEvent[];
  cancelled: boolean;
};

/**
 * Deterministic in-memory client over the connection-bound flow.
 *
 * `createRun` records the run's event script keyed by its turn id and streams it
 * on the same call — identity first (`sidechat.started`), then the scripted
 * events, matching the real POST-is-the-stream contract. `subscribeTurn` replays
 * events with `sequence > after`, so a remount/reconnect resumes from the last
 * seen sequence without duplicating already-applied events. `cancelTurn` flips
 * the run to cancelled. State lives per client instance, mirroring how a single
 * browser session resumes its own in-flight turn.
 */
export const createMockStreamClient = (
  config?: Pick<WidgetHarnessConfig, "scenario">,
): SideChatApiClient => {
  const runs = new Map<string, MockRun>();
  const scenario = config?.scenario ?? "default";

  return {
    createRun: (request) => {
      const assistantTurnId = `turn-${request.requestId}`;
      const events = createMockEvents(request, scenario);
      const run: MockRun = {
        requestId: request.requestId,
        conversationId: startedConversationId(events),
        events,
        cancelled: false,
      };
      runs.set(assistantTurnId, run);
      return Promise.resolve({
        requestId: request.requestId,
        assistantTurnId,
        conversationId: run.conversationId,
        events: replayMockEvents(run, -1),
      });
    },
    subscribeTurn: (assistantTurnId, options) => {
      const run = runs.get(assistantTurnId);
      if (!run) throw new Error(`Unknown mock turn ${assistantTurnId}`);
      return Promise.resolve({ events: replayMockEvents(run, options?.after ?? -1) });
    },
    resolveRun: (requestId) => {
      const run = findRunByRequest(runs, requestId);
      return Promise.resolve({
        assistantTurnId: `turn-${requestId}`,
        status: run?.cancelled ? "cancelled" : "running",
      });
    },
    getTurnStatus: (assistantTurnId) => {
      const run = runs.get(assistantTurnId);
      return Promise.resolve({
        assistantTurnId,
        conversationId: run?.conversationId ?? "mock-conversation",
        requestId: run?.requestId ?? assistantTurnId.replace(/^turn-/u, ""),
        status: run?.cancelled ? "cancelled" : "running",
      });
    },
    cancelTurn: (assistantTurnId) => {
      const run = runs.get(assistantTurnId);
      if (run) run.cancelled = true;
      return Promise.resolve({ assistantTurnId, cancelRequested: run !== undefined });
    },
  };
};

const replayMockEvents = async function* (
  run: MockRun,
  after: number,
): AsyncIterable<SidechatStreamEvent> {
  for (const event of run.events) {
    if (event.sequence <= after) continue;
    await Promise.resolve();
    yield event;
  }
};

const findRunByRequest = (runs: Map<string, MockRun>, requestId: string): MockRun | undefined => {
  for (const run of runs.values()) {
    if (run.requestId === requestId) return run;
  }
  return undefined;
};

const startedConversationId = (events: readonly SidechatStreamEvent[]): string => {
  const started = events.find((event) => event.type === "sidechat.started");
  return started && "conversationId" in started && started.conversationId
    ? started.conversationId
    : "mock-conversation";
};

export const createMockEvents = (
  request: ChatStreamRequest,
  scenario: WidgetHarnessConfig["scenario"] = "default",
): readonly SidechatStreamEvent[] => {
  const assistantTurnId = `turn-${request.requestId}`;
  const toolEvents =
    scenario === "tool" || shouldUseSearchTool(request.message.content)
      ? [
          toolRunningEvent(assistantTurnId, request.message.content),
          toolCompletedEvent(assistantTurnId, request.message.content),
        ]
      : [];
  const deltaSequence = toolEvents.length > 0 ? 4 : 2;
  const hostCommandSequence = deltaSequence + 1;
  const completedSequence = hostCommandSequence + 1;

  if (scenario === "error") {
    return [
      started(assistantTurnId),
      reasoningEvent(assistantTurnId),
      {
        ...baseEvent(assistantTurnId, 2),
        type: "sidechat.error",
        code: "internal_error",
        message: "Mock stream failed",
        retryable: true,
      },
    ];
  }

  const workspaceId =
    typeof request.hostContext?.metadata?.["workspaceId"] === "string"
      ? request.hostContext.metadata["workspaceId"]
      : "unknown-workspace";
  const responseContent =
    scenario === "echo-request"
      ? `Mock response: ${request.message.content} model=${request.turnProfileId ?? "none"} workspace=${workspaceId}`
      : `Mock response: ${request.message.content}`;

  return [
    started(assistantTurnId),
    reasoningEvent(assistantTurnId),
    ...toolEvents,
    deltaEvent(assistantTurnId, deltaSequence, responseContent),
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
  title: "Open support ticket #4821",
  details: {
    hostCommand: {
      commandId: "mock-command-open-resource",
      commandName: "open_resource",
      payload: { resourceType: "ticket", resourceId: "ticket-4821" },
    },
  },
});

const completedEvent = (assistantTurnId: string, sequence: number): CompletedEvent => ({
  ...baseEvent(assistantTurnId, sequence),
  type: "sidechat.completed",
  finishReason: "stop",
});

const shouldUseSearchTool = (text: string): boolean => /\b(search|web|lookup)\b/iu.test(text);
