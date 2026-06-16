import { SIDECHAT_EVENT_TYPES, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import {
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type AiRuntimeRequest,
  type RuntimeEvent,
} from "@side-chat/ai-runtime-contract";
import { Effect, Stream } from "effect";
import type { AuthContext } from "#domain/authority";
import {
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
  type HostCapabilityManifest,
  type PreparedTurnContext,
  type TurnPolicyDecision,
} from "#domain/capabilities";
import {
  type AiRuntimePort,
  type AssistantTurnLifecyclePort,
  type ClockPort,
  DISABLED_CONVERSATION_TITLE_GENERATION,
  type ConversationTitleGenerationPort,
  type ContextManagerPort,
  type ConversationRepositoryPort,
  type IdGeneratorPort,
  type TurnGuardRegistryPort,
} from "#ports";
import type { PolicyEvaluationInput, PolicyPort } from "#policies/policy";
import { createPartnerAiCoreLayer } from "#services/effect-runtime";
import type { ObservabilitySinkPort } from "#services/observability";
import { streamChatEffect, type StreamChatInput } from "#application/stream-chat/stream-chat";
import {
  createManifest,
  createPreparedContext,
  resolveTestProfile,
} from "./fixtures.test-support.js";

type RuntimeEventFixture =
  | readonly RuntimeEvent[]
  | ((request: AiRuntimeRequest) => readonly RuntimeEvent[]);

export type FakePortOptions = {
  readonly authContext?: AuthContext | undefined;
  readonly runtimeEvents?: RuntimeEventFixture | undefined;
  readonly conversationTitleGeneration?: ConversationTitleGenerationPort | undefined;
  readonly policies?: PolicyPort | undefined;
  readonly manifest?: HostCapabilityManifest | undefined;
  readonly policyDecision?: TurnPolicyDecision | undefined;
  readonly turnGuards?: TurnGuardRegistryPort | undefined;
  readonly contextManager?: ContextManagerPort | undefined;
  readonly preparedContext?: PreparedTurnContext | undefined;
  readonly observability?: ObservabilitySinkPort | undefined;
};

export const createFakePorts = (options: FakePortOptions = {}) => {
  const calls: string[] = [];
  const runtimeRequests: AiRuntimeRequest[] = [];
  const completedTurns: Parameters<AssistantTurnLifecyclePort["completeAssistantTurn"]>[0][] = [];
  const failedTurns: Parameters<AssistantTurnLifecyclePort["failAssistantTurn"]>[0][] = [];
  const preparedTitles: Parameters<ConversationRepositoryPort["prepareConversationTitle"]>[0][] =
    [];
  const manifest = options.manifest ?? createManifest();
  const profile = resolveTestProfile(manifest);
  const policyDecision =
    options.policyDecision ??
    createTurnPolicyDecision({
      manifest,
      profile,
      manifestHash: hashHostCapabilityManifest(manifest),
    });
  const preparedContext = options.preparedContext ?? createPreparedContext(profile, policyDecision);
  const clock: ClockPort = { now: () => "2026-05-23T13:00:00.000Z" };
  const ids = createIdGeneratorPort();
  const conversations = createConversationRepositoryPort(calls, preparedTitles);
  const assistantTurns = createAssistantTurnLifecyclePort(calls, completedTurns, failedTurns);
  const runtime = createRuntimePort(calls, runtimeRequests, options.runtimeEvents);

  return {
    calls,
    runtimeRequests,
    completedTurns,
    failedTurns,
    preparedTitles,
    assistantTurns,
    hostCapabilities: {
      loadManifest: () => {
        calls.push("hostCapabilities");
        return Effect.succeed(manifest);
      },
    },
    turnGuards: options.turnGuards ?? { guards: [] },
    turnPolicies: {
      resolveTurnPolicy: () => {
        calls.push("turnPolicy");
        return Effect.succeed(policyDecision);
      },
    },
    contextManager: {
      prepareTurnContext: (
        contextInput: Parameters<ContextManagerPort["prepareTurnContext"]>[0],
      ) => {
        calls.push("contextManager");
        if (options.contextManager) {
          return options.contextManager.prepareTurnContext(contextInput);
        }
        return Effect.succeed(preparedContext);
      },
    },
    policies: {
      evaluate: (policyInput: PolicyEvaluationInput) => {
        calls.push("policy");
        return (
          options.policies ?? {
            evaluate: () => Effect.succeed({ allowed: true } as const),
          }
        ).evaluate(policyInput);
      },
    },
    conversations,
    runtime,
    conversationTitleGeneration:
      options.conversationTitleGeneration ?? DISABLED_CONVERSATION_TITLE_GENERATION,
    clock,
    ids,
    observability: options.observability,
  };
};

export const runStreamChat = (
  streamInput: StreamChatInput,
  ports: ReturnType<typeof createFakePorts>,
): AsyncIterable<SidechatStreamEvent> =>
  Stream.toAsyncIterable(
    streamChatEffect(streamInput).pipe(
      Stream.provide(
        createPartnerAiCoreLayer({
          conversations: ports.conversations,
          hostCapabilities: ports.hostCapabilities,
          assistantTurns: ports.assistantTurns,
          turnPolicies: ports.turnPolicies,
          turnGuards: ports.turnGuards,
          contextManager: ports.contextManager,
          runtime: ports.runtime,
          conversationTitleGeneration: ports.conversationTitleGeneration,
          clock: ports.clock,
          ids: ports.ids,
          policies: ports.policies,
          observability: ports.observability,
        }),
      ),
    ),
  );

export const collect = async <T>(items: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
};

export const isTerminalEvent = (event: SidechatStreamEvent): boolean =>
  event.type === SIDECHAT_EVENT_TYPES.COMPLETED || event.type === SIDECHAT_EVENT_TYPES.ERROR;

const createIdGeneratorPort = (): IdGeneratorPort => ({
  nextConversationId: () => "conversation_001",
  nextEventId: (() => {
    let index = 0;
    return () => {
      index += 1;
      return `event_${index.toString().padStart(3, "0")}`;
    };
  })(),
});

const createConversationRepositoryPort = (
  calls: string[],
  preparedTitles: Parameters<ConversationRepositoryPort["prepareConversationTitle"]>[0][],
): ConversationRepositoryPort => ({
  ensureConversation: ({ authContext: context, fallbackConversationId }) => {
    calls.push("ensureConversation");
    return Effect.succeed({
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      conversationId: fallbackConversationId,
    });
  },
  appendUserMessage: () => {
    calls.push("appendUserMessage");
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

const createAssistantTurnLifecyclePort = (
  calls: string[],
  completedTurns: Parameters<AssistantTurnLifecyclePort["completeAssistantTurn"]>[0][],
  failedTurns: Parameters<AssistantTurnLifecyclePort["failAssistantTurn"]>[0][],
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
    return Effect.succeed(undefined);
  },
  failAssistantTurn: (turn) => {
    calls.push("failAssistantTurn");
    failedTurns.push(turn);
    return Effect.succeed(undefined);
  },
});

const createRuntimePort = (
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
