import { SIDECHAT_EVENT_TYPES, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import {
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type AgentRuntimeRequest,
  type RuntimeEvent,
} from "@side-chat/agent-runtime";
import { optionalField } from "@side-chat/shared";
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
  type AgentRuntimePort,
  type AssistantTurnLifecyclePort,
  type ClockPort,
  type ContextManagerPort,
  type ConversationRepositoryPort,
  type IdGeneratorPort,
  type MemoryPort,
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

export type FakePortOptions = {
  readonly authContext?: AuthContext;
  readonly runtimeEvents?: readonly RuntimeEvent[];
  readonly policies?: PolicyPort;
  readonly manifest?: HostCapabilityManifest;
  readonly policyDecision?: TurnPolicyDecision;
  readonly turnGuards?: TurnGuardRegistryPort;
  readonly contextManager?: ContextManagerPort;
  readonly preparedContext?: PreparedTurnContext;
  readonly memory?: MemoryPort;
  readonly observability?: ObservabilitySinkPort;
};

export const createFakePorts = (options: FakePortOptions = {}) => {
  const calls: string[] = [];
  const runtimeRequests: AgentRuntimeRequest[] = [];
  const completedTurns: Parameters<AssistantTurnLifecyclePort["completeAssistantTurn"]>[0][] = [];
  const failedTurns: Parameters<AssistantTurnLifecyclePort["failAssistantTurn"]>[0][] = [];
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
  const conversations = createConversationRepositoryPort(calls);
  const assistantTurns = createAssistantTurnLifecyclePort(calls, completedTurns, failedTurns);
  const runtime = createRuntimePort(calls, runtimeRequests, options.runtimeEvents);

  return {
    calls,
    runtimeRequests,
    completedTurns,
    failedTurns,
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
    memory:
      options.memory ??
      ({
        recall: () => Effect.succeed([]),
        proposeWriteCandidates: () => Effect.succeed([]),
        writeCandidates: () => Effect.succeed(undefined),
      } satisfies MemoryPort),
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
    clock,
    ids,
    ...optionalField("observability", options.observability),
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
          memory: ports.memory,
          runtime: ports.runtime,
          clock: ports.clock,
          ids: ports.ids,
          policies: ports.policies,
          ...optionalField("observability", ports.observability),
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

const createConversationRepositoryPort = (calls: string[]): ConversationRepositoryPort => ({
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
  runtimeRequests: AgentRuntimeRequest[],
  runtimeEvents: readonly RuntimeEvent[] | undefined,
): AgentRuntimePort => ({
  streamEffect: (runtimeRequest) => {
    calls.push("runtime");
    runtimeRequests.push(runtimeRequest);
    return Stream.fromIterable(runtimeEvents ?? defaultRuntimeEvents());
  },
});

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
