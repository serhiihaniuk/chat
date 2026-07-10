import {
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  type ActivityEvent,
} from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";

import {
  applyActivityEvent,
  completeActivityTimeline,
  type WidgetActivityTimeline,
} from "./activity.js";
import {
  carryTranscriptActivity,
  createDefaultRequest,
  createWidgetMessage,
  toErrorMessage,
  updateMessage,
  type WidgetMessage,
} from "./widget-chat.js";

describe("widget-state", () => {
  it("creates protocol requests with optional profile, host context, and model preference", () => {
    const request = createDefaultRequest({
      turnProfileId: "gpt-5.4-mini",
      content: "hello",
      hostContext: {
        schemaVersion: "widget-harness.host-context.v1",
        title: "Portfolio",
      },
      messageId: "message_001",
      model: {
        providerId: "openai",
        modelId: "gpt-5.5-mini",
        reasoningEffort: "high",
      },
      requestId: "request_001",
    });

    expect(request).toEqual({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      requestId: "request_001",
      turnProfileId: "gpt-5.4-mini",
      model: {
        providerId: "openai",
        modelId: "gpt-5.5-mini",
        reasoningEffort: "high",
      },
      message: {
        id: "message_001",
        content: "hello",
      },
      hostContext: {
        schemaVersion: "widget-harness.host-context.v1",
        title: "Portfolio",
      },
    });
  });

  it("omits optional request fields when they are unavailable", () => {
    const request = createDefaultRequest({
      content: "hello",
      messageId: "message_001",
      requestId: "request_001",
    });

    expect(request).toEqual({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      requestId: "request_001",
      message: {
        id: "message_001",
        content: "hello",
      },
    });
  });

  it("initializes widget messages with an empty canonical activity timeline", () => {
    expect(createWidgetMessage("assistant_001", "assistant", "", true)).toEqual({
      id: "assistant_001",
      role: "assistant",
      content: "",
      activity: { items: [] },
      isStreaming: true,
    });
  });

  it("updates only the matching message", () => {
    const messages = [
      createWidgetMessage("user_001", "user", "hello"),
      createWidgetMessage("assistant_001", "assistant", ""),
    ];

    const updated = updateMessage(messages, "assistant_001", (message) => ({
      ...message,
      content: "done",
    }));

    expect(updated).toEqual([
      messages[0],
      {
        ...messages[1],
        content: "done",
      },
    ]);
    expect(updated).not.toBe(messages);
  });

  it("merges repeated activity events without changing completed row presentation", () => {
    const started = createToolActivity({
      status: "running",
      title: "Run search",
      details: {
        tool: {
          toolCallId: "tool_call_001",
          toolName: "mock_web_search",
          input: { query: "search web" },
        },
      },
    });
    const completed = createToolActivity({
      sequence: 9,
      status: "completed",
      title: "Updated title should stay hidden",
      details: {
        tool: {
          toolCallId: "tool_call_001",
          toolName: "mock_web_search",
          result: { summary: "found context" },
          sources: [{ label: "Example", url: "https://example.test/result" }],
        },
      },
    });

    const timeline = applyActivityEvent(applyActivityEvent({ items: [] }, started), completed);

    expect(timeline.items).toEqual([
      expect.objectContaining({
        id: "tool_call_001",
        sequence: 3,
        status: "completed",
        title: "Run search",
        details: {
          tool: {
            toolCallId: "tool_call_001",
            toolName: "mock_web_search",
            input: { query: "search web" },
            result: { summary: "found context" },
            sources: [{ label: "Example", url: "https://example.test/result" }],
          },
        },
      }),
    ]);
  });

  it("streams reasoning updates into one active row", () => {
    const started = createProgressActivity({
      activityId: "reasoning_001",
      activityKind: "reasoning",
      sequence: 1,
      status: "running",
      title: "Thinking",
    });
    const updated = createProgressActivity({
      activityId: "reasoning_001",
      activityKind: "reasoning",
      sequence: 2,
      status: "running",
      title: "Listing common crisis reasons",
      body: "The user is asking for a list.",
    });
    const completed = createProgressActivity({
      activityId: "reasoning_001",
      activityKind: "reasoning",
      sequence: 3,
      status: "completed",
      title: "Listing common crisis reasons",
      body: "The user is asking for a list.",
    });

    const timeline = [started, updated, completed].reduce<WidgetActivityTimeline>(
      (current, event) => applyActivityEvent(current, event),
      { items: [] },
    );

    expect(timeline.items).toEqual([
      expect.objectContaining({
        id: "reasoning_001",
        status: "completed",
        title: "Listing common crisis reasons",
        body: "The user is asking for a list.",
      }),
    ]);
  });

  it("keeps exactly one activity item visually active without fabricating completion", () => {
    const first = createProgressActivity({
      activityId: "activity_001",
      sequence: 1,
      status: "running",
      title: "Searching",
    });
    const second = createProgressActivity({
      activityId: "activity_002",
      sequence: 2,
      status: "running",
      title: "Reading results",
    });

    const timeline = applyActivityEvent(applyActivityEvent({ items: [] }, first), second);

    expect(timeline.activeItemId).toBe("activity_002");
    expect(timeline.items.map((item) => [item.id, item.status])).toEqual([
      ["activity_001", "running"],
      ["activity_002", "running"],
    ]);
  });

  it("preserves late tool results after a newer activity becomes active", () => {
    const toolStarted = createToolActivity({
      activityId: "tool_call_001",
      sequence: 1,
      status: "running",
      title: "Run mock_web_search",
      details: {
        tool: {
          toolCallId: "tool_call_001",
          toolName: "mock_web_search",
          input: { query: "search web" },
        },
      },
    });
    const reasoningStarted = createProgressActivity({
      activityId: "reasoning_001",
      activityKind: "reasoning",
      sequence: 2,
      status: "running",
      title: "Reading search result",
    });
    const toolCompleted = createToolActivity({
      activityId: "tool_call_001",
      sequence: 3,
      status: "completed",
      title: "Run mock_web_search",
      details: {
        tool: {
          toolCallId: "tool_call_001",
          toolName: "mock_web_search",
          result: { summary: "found context" },
          sources: [{ label: "Example", url: "https://example.test/result" }],
        },
      },
    });

    const timeline = [toolStarted, reasoningStarted, toolCompleted].reduce<WidgetActivityTimeline>(
      (current, event) => applyActivityEvent(current, event),
      { items: [] },
    );

    expect(timeline.activeItemId).toBe("reasoning_001");
    expect(timeline.items).toEqual([
      expect.objectContaining({
        id: "tool_call_001",
        sequence: 1,
        status: "completed",
        details: {
          tool: {
            toolCallId: "tool_call_001",
            toolName: "mock_web_search",
            input: { query: "search web" },
            result: { summary: "found context" },
            sources: [{ label: "Example", url: "https://example.test/result" }],
          },
        },
      }),
      expect.objectContaining({
        id: "reasoning_001",
        status: "running",
      }),
    ]);
  });

  it("completes active activity when the assistant stream finishes", () => {
    const timeline = completeActivityTimeline(
      applyActivityEvent(
        { items: [] },
        createProgressActivity({
          activityId: "activity_001",
          status: "running",
          title: "Working",
        }),
      ),
      "2026-05-25T00:00:03.000Z",
    );

    expect(timeline).toMatchObject({
      activeItemId: undefined,
      completedAt: "2026-05-25T00:00:03.000Z",
      items: [{ status: "completed" }],
    });
  });

  it("maps unknown errors for UI display", () => {
    expect(toErrorMessage(new Error("nope"))).toBe("nope");
    expect(toErrorMessage("nope")).toBe("Chat request failed");
  });
});

const createToolActivity = (overrides: Partial<ActivityEvent>): ActivityEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: SIDECHAT_EVENT_TYPES.ACTIVITY,
  eventId: "event_tool_001",
  assistantTurnId: "turn_001",
  sequence: 3,
  createdAt: "2026-05-25T00:00:00.000Z",
  activityId: "tool_call_001",
  activityKind: "tool",
  status: "running",
  title: "Run mock_web_search",
  ...overrides,
});

const createProgressActivity = (overrides: Partial<ActivityEvent>): ActivityEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: SIDECHAT_EVENT_TYPES.ACTIVITY,
  eventId: "event_progress_001",
  assistantTurnId: "turn_001",
  sequence: 1,
  createdAt: "2026-05-25T00:00:00.000Z",
  activityId: "progress_001",
  activityKind: "progress",
  status: "completed",
  title: "Searching the web",
  ...overrides,
});

describe("carryTranscriptActivity", () => {
  const withActivity = (message: WidgetMessage): WidgetMessage => ({
    ...message,
    activity: applyActivityEvent(message.activity, createToolActivity({})),
  });

  it("re-attaches the run's timelines onto the tail-aligned history transcript", () => {
    // Run transcript: local ids, thinking info on the assistant reply.
    const runMessages = [
      createWidgetMessage("local-user", "user", "find docs"),
      withActivity(createWidgetMessage("local-assistant", "assistant", "Here they are.")),
    ];
    // History transcript: server ids, an extra older exchange, empty timelines.
    const history = [
      createWidgetMessage("msg_1", "user", "hello"),
      createWidgetMessage("msg_2", "assistant", "hi"),
      createWidgetMessage("msg_3", "user", "find docs"),
      createWidgetMessage("msg_4", "assistant", "Here they are."),
    ];

    const carried = carryTranscriptActivity(history, runMessages);

    // Identity (server id) is kept; only the timeline is carried over.
    expect(carried[3]?.id).toBe("msg_4");
    expect(carried[3]?.activity.items).toHaveLength(1);
    expect(carried.slice(0, 3)).toEqual(history.slice(0, 3));
  });

  it("skips a counterpart whose role or content diverged", () => {
    const runMessages = [
      withActivity(createWidgetMessage("local-assistant", "assistant", "the run's answer")),
    ];
    const history = [createWidgetMessage("msg_1", "assistant", "a different committed answer")];

    // Diverged content (another tab, truncation): never mislabel the message.
    expect(carryTranscriptActivity(history, runMessages)).toBe(history);
  });

  it("returns the history transcript untouched when the run carried no thinking info", () => {
    const runMessages = [createWidgetMessage("local-assistant", "assistant", "plain answer")];
    const history = [createWidgetMessage("msg_1", "assistant", "plain answer")];

    expect(carryTranscriptActivity(history, runMessages)).toBe(history);
  });

  it("preserves a persisted history timeline instead of replacing it with the run snapshot", () => {
    const runMessages = [
      withActivity(createWidgetMessage("local-assistant", "assistant", "Here they are.")),
    ];
    const historyMessage = createWidgetMessage("msg_1", "assistant", "Here they are.");
    const history = [
      {
        ...historyMessage,
        activity: applyActivityEvent(
          historyMessage.activity,
          createToolActivity({ activityId: "persisted_activity", title: "Persisted trace" }),
        ),
      },
    ];

    expect(carryTranscriptActivity(history, runMessages)).toBe(history);
    expect(history[0]?.activity.items[0]?.title).toBe("Persisted trace");
  });
});
