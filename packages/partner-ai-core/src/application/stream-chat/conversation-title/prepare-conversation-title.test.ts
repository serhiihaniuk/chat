import {
  RUNTIME_ERROR_CODES,
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type RuntimeEvent,
} from "@side-chat/agent-runtime";
import { SIDECHAT_EVENT_TYPES } from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";
import { authContext, input } from "#testing/stream-chat/fixtures.test-support";
import {
  collect,
  createFakePorts,
  isTerminalEvent,
  runStreamChat,
} from "#testing/stream-chat/fake-ports.test-support";

describe("stream chat conversation title generation", () => {
  it("runs a no-tools title job after the first completed exchange", async () => {
    const ports = createFakePorts({
      authContext,
      conversationTitleGeneration: enabledTitleGenerationConfig(),
    });

    const events = await collect(runStreamChat(input, ports));

    expect(events.at(-1)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.COMPLETED });
    expect(ports.calls).toEqual([
      "hostCapabilities",
      "turnPolicy",
      "policy",
      "ensureConversation",
      "appendUserMessage",
      "startAssistantTurn",
      "contextManager",
      "recordContextSnapshot",
      "runtime",
      "completeAssistantTurn",
      "runtime",
      "prepareConversationTitle",
    ]);
    expect(ports.runtimeRequests[1]).toMatchObject({
      requestId: "request_001:conversation-title",
      assistantTurnId: "assistant_turn_001:conversation-title",
      providerId: "fake",
      modelId: "fake-echo",
      systemInstructions: "Return only a safe, short title.",
      availableToolNames: [],
      messages: [
        {
          role: "user",
          content: expect.stringContaining("Prepare a short conversation title"),
        },
      ],
    });
    expect(ports.runtimeRequests[1]?.contextBoard).toBeUndefined();
    expect(ports.runtimeRequests[1]?.toolScope).toBeUndefined();
    expect(ports.preparedTitles[0]).toMatchObject({
      conversationId: "conversation_001",
      titleText: "Fake response",
      now: "2026-05-23T13:00:00.000Z",
    });
  });

  it("keeps the completed terminal event when title generation fails", async () => {
    const ports = createFakePorts({
      authContext,
      conversationTitleGeneration: enabledTitleGenerationConfig(),
      runtimeEvents: (runtimeRequest) =>
        `${runtimeRequest.requestId}`.endsWith(":conversation-title")
          ? titleRuntimeErrorEvents()
          : successfulRuntimeEvents(),
    });

    const events = await collect(runStreamChat(input, ports));

    expect(events.at(-1)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.COMPLETED });
    expect(events.filter(isTerminalEvent)).toHaveLength(1);
    expect(ports.completedTurns).toHaveLength(1);
    expect(ports.failedTurns).toEqual([]);
    expect(ports.preparedTitles).toEqual([]);
  });
});

const enabledTitleGenerationConfig = () =>
  ({
    mode: "enabled",
    prompt: {
      systemInstructions: "Return only a safe, short title.",
      taskInstructions: "Prepare a short conversation title for this completed exchange.",
      userMessageLabel: "User message",
      assistantResponseLabel: "Assistant response",
    },
  }) as const;

const successfulRuntimeEvents = (): readonly RuntimeEvent[] => [
  {
    type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
    requestId: "request_001",
    assistantTurnId: "assistant_turn_001",
    sequence: 0,
    content: "Fake response",
  },
  {
    type: RUNTIME_EVENT_TYPES.COMPLETED,
    requestId: "request_001",
    assistantTurnId: "assistant_turn_001",
    sequence: 1,
    finishReason: RUNTIME_FINISH_REASONS.STOP,
  },
];

const titleRuntimeErrorEvents = (): readonly RuntimeEvent[] => [
  {
    type: RUNTIME_EVENT_TYPES.ERROR,
    requestId: "request_001:conversation-title",
    assistantTurnId: "assistant_turn_001:conversation-title",
    sequence: 0,
    code: RUNTIME_ERROR_CODES.INTERNAL_ERROR,
    message: "title model failed",
    retryable: false,
  },
];
