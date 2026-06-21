import type { SidechatStreamEvent } from "@side-chat/chat-protocol";
import {
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type AiRuntimeRequest,
  type RuntimeEvent,
} from "@side-chat/ai-runtime-contract";
import { Effect, Stream } from "effect";
import {
  type AiRuntimePort,
  type AssistantTurnLifecyclePort,
  type AssistantTurnStatus,
  type ConversationRepositoryPort,
  type IdGeneratorPort,
  type TurnControlState,
  type TurnEventLogPort,
} from "#ports";

export type RuntimeEventFixture =
  | readonly RuntimeEvent[]
  | ((request: AiRuntimeRequest) => readonly RuntimeEvent[]);

export const createIdGeneratorPort = (): IdGeneratorPort => ({
  nextConversationId: () => "conversation_001",
  nextEventId: (() => {
    let index = 0;
    return () => {
      index += 1;
      return `event_${index.toString().padStart(3, "0")}`;
    };
  })(),
});

export const createConversationRepositoryPort = (
  calls: string[],
  ensuredConversations: Parameters<ConversationRepositoryPort["ensureConversation"]>[0][],
  appendedUserMessages: Parameters<ConversationRepositoryPort["appendUserMessage"]>[0][],
  preparedTitles: Parameters<ConversationRepositoryPort["prepareConversationTitle"]>[0][],
): ConversationRepositoryPort => ({
  ensureConversation: (conversationInput) => {
    calls.push("ensureConversation");
    ensuredConversations.push(conversationInput);
    return Effect.succeed({
      tenantId: conversationInput.authContext.tenantId,
      workspaceId: conversationInput.authContext.workspaceId,
      conversationId: conversationInput.fallbackConversationId,
    });
  },
  appendUserMessage: (messageInput) => {
    calls.push("appendUserMessage");
    appendedUserMessages.push(messageInput);
    return Effect.succeed({
      tenantId: "tenant_001",
      workspaceId: "workspace_001",
      conversationId: "conversation_001",
      messageId: "message_record_001",
      sequenceIndex: 0,
    });
  },
  prepareConversationTitle: (titleInput) => {
    calls.push("prepareConversationTitle");
    preparedTitles.push(titleInput);
    return Effect.succeed(undefined);
  },
});

/**
 * Mutable control state the fake lifecycle port exposes to `readTurnControlState`.
 *
 * `status` mirrors the durable turn status (flipped by complete/fail so the
 * abnormal finalizer's running-guard skip can be exercised), and `cancelRequested`
 * lets a test seed durable cancel intent so an interrupt is classified honestly.
 */
export type FakeTurnControlState = {
  status: AssistantTurnStatus;
  cancelRequested: boolean;
};

export const createAssistantTurnLifecyclePort = (
  calls: string[],
  completedTurns: Parameters<AssistantTurnLifecyclePort["completeAssistantTurn"]>[0][],
  failedTurns: Parameters<AssistantTurnLifecyclePort["failAssistantTurn"]>[0][],
  controlState: FakeTurnControlState = { status: "running", cancelRequested: false },
): AssistantTurnLifecyclePort => ({
  startAssistantTurn: () => {
    calls.push("startAssistantTurn");
    return Effect.succeed({
      tenantId: "tenant_001",
      workspaceId: "workspace_001",
      conversationId: "conversation_001",
      assistantTurnId: "assistant_turn_001",
      status: "running",
      inserted: true,
    });
  },
  recordContextSnapshot: () => {
    calls.push("recordContextSnapshot");
    return Effect.succeed(undefined);
  },
  completeAssistantTurn: (turn) => {
    calls.push("completeAssistantTurn");
    completedTurns.push(turn);
    controlState.status = "completed";
    return Effect.succeed(undefined);
  },
  failAssistantTurn: (turn) => {
    calls.push("failAssistantTurn");
    failedTurns.push(turn);
    controlState.status = turn.status;
    return Effect.succeed(undefined);
  },
  readTurnControlState: (): Effect.Effect<TurnControlState | undefined> => {
    calls.push("readTurnControlState");
    return Effect.succeed({
      status: controlState.status,
      cancelRequested: controlState.cancelRequested,
    });
  },
});

/**
 * In-memory turn-event log mirroring the durable adapter's read semantics.
 *
 * Append records the event for assertions; reads use the same `sequence > after`
 * convention as the real adapter. The one-terminal partial-unique guard lives in
 * the durable repository, so server-level runner tests exercise it through the
 * memory repositories rather than this fake.
 */
export const createTurnEventLogPort = (
  calls: string[],
  appendedEvents: SidechatStreamEvent[],
): TurnEventLogPort => ({
  appendEvent: ({ event }) => {
    calls.push("appendTurnEvent");
    appendedEvents.push(event);
    return Effect.void;
  },
  readEventsAfter: ({ after }) =>
    Effect.succeed(
      appendedEvents
        .filter((event) => event.sequence > after)
        .sort((left, right) => left.sequence - right.sequence),
    ),
  maxSequence: () =>
    Effect.succeed(
      appendedEvents.length === 0
        ? undefined
        : Math.max(...appendedEvents.map((event) => event.sequence)),
    ),
});

export const createRuntimePort = (
  calls: string[],
  runtimeRequests: AiRuntimeRequest[],
  runtimeEvents: RuntimeEventFixture | undefined,
): AiRuntimePort => ({
  streamEffect: (runtimeRequest) => {
    calls.push("runtime");
    runtimeRequests.push(runtimeRequest);
    return Stream.fromIterable(resolveRuntimeEvents(runtimeEvents, runtimeRequest));
  },
});

const resolveRuntimeEvents = (
  runtimeEvents: RuntimeEventFixture | undefined,
  runtimeRequest: AiRuntimeRequest,
): readonly RuntimeEvent[] => {
  if (!runtimeEvents) return defaultRuntimeEvents();
  return typeof runtimeEvents === "function" ? runtimeEvents(runtimeRequest) : runtimeEvents;
};

const defaultRuntimeEvents = (): readonly RuntimeEvent[] => [
  {
    type: RUNTIME_EVENT_TYPES.ACTIVITY,
    requestId: "request_001",
    assistantTurnId: "assistant_turn_001",
    sequence: 0,
    activityId: "activity_001",
    activityKind: "reasoning",
    status: "completed",
    title: "Fake runtime selected deterministic response",
  },
  {
    type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
    requestId: "request_001",
    assistantTurnId: "assistant_turn_001",
    sequence: 1,
    content: "Fake response",
  },
  {
    type: RUNTIME_EVENT_TYPES.COMPLETED,
    requestId: "request_001",
    assistantTurnId: "assistant_turn_001",
    sequence: 2,
    finishReason: RUNTIME_FINISH_REASONS.STOP,
    usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
  },
];
