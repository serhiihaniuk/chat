import { isTerminalEvent, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { AiRuntimeRequest } from "@side-chat/ai-runtime-contract";
import { Effect } from "effect";
import type { AuthContext } from "#domain/authority";
import {
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
  type HostCapabilityManifest,
  type PreparedTurnContext,
  type TurnPolicyDecision,
} from "#domain/capabilities-contract";
import {
  type ActiveConversationTurn,
  type AssistantTurnLifecyclePort,
  type ClockPort,
  DISABLED_CONVERSATION_TITLE_GENERATION,
  type ConversationTitleGenerationPort,
  type ContextManagerPort,
  type ConversationRepositoryPort,
  type TurnActivityHistoryMode,
  type TurnGuardRegistryPort,
} from "#ports";
import type { PolicyEvaluationInput, PolicyPort } from "#policies/policy";
import type { ObservabilitySinkPort } from "#services/observability";
import { prepareStreamChatTurn } from "#application/stream-chat/turn/prepare-stream-chat-turn";
import {
  runTurnGeneration,
  type TurnLeaseSettings,
} from "#application/stream-chat/protocol/run-turn-generation";
import type { StreamChatInput, StreamChatPorts } from "#application/stream-chat/stream-chat-types";
import {
  createManifest,
  createPreparedContext,
  resolveTestProfile,
} from "./fixtures.test-support.js";
import {
  createAssistantTurnLifecyclePort,
  createConversationRepositoryPort,
  createIdGeneratorPort,
  createRuntimePort,
  createTurnEventLogPort,
  type FakeTurnControlState,
  type RuntimeEventFixture,
} from "./fake-port-builders.test-support.js";

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
  /** Turn-activity retention posture; tests default to "full" (store the trace). */
  readonly turnActivityHistory?: TurnActivityHistoryMode | undefined;
  /** Seeds the durable control state `readTurnControlState` returns (cancel intent). */
  readonly turnControlState?: FakeTurnControlState | undefined;
  /** Seeds the conversation's in-flight turn the busy guard consults at pre-start. */
  readonly activeConversationTurn?: ActiveConversationTurn | undefined;
};

export const createFakePorts = (options: FakePortOptions = {}) => {
  const calls: string[] = [];
  const runtimeRequests: AiRuntimeRequest[] = [];
  const completedTurns: Parameters<AssistantTurnLifecyclePort["completeAssistantTurn"]>[0][] = [];
  const failedTurns: Parameters<AssistantTurnLifecyclePort["failAssistantTurn"]>[0][] = [];
  const ensuredConversations: Parameters<ConversationRepositoryPort["ensureConversation"]>[0][] =
    [];
  const appendedUserMessages: Parameters<ConversationRepositoryPort["appendUserMessage"]>[0][] = [];
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
  const conversations = createConversationRepositoryPort(
    calls,
    ensuredConversations,
    appendedUserMessages,
    preparedTitles,
  );
  const turnControlState = options.turnControlState ?? {
    status: "running" as const,
    cancelRequested: false,
  };
  const assistantTurns = createAssistantTurnLifecyclePort(
    calls,
    completedTurns,
    failedTurns,
    turnControlState,
    options.activeConversationTurn,
  );
  const runtime = createRuntimePort(calls, runtimeRequests, options.runtimeEvents);
  const appendedEvents: SidechatStreamEvent[] = [];
  const turnEventLog = createTurnEventLogPort(calls, appendedEvents);

  return {
    calls,
    runtimeRequests,
    completedTurns,
    failedTurns,
    ensuredConversations,
    appendedUserMessages,
    preparedTitles,
    appendedEvents,
    turnControlState,
    assistantTurns,
    turnEventLog,
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
    // Tests exercise the store-the-trace path by default; the disabled posture is
    // covered explicitly where a test asserts nothing is retained.
    turnActivityHistory: options.turnActivityHistory ?? ("full" as const),
    clock,
    ids,
    observability: options.observability,
  };
};

/**
 * Run one turn through the server-owned path and replay its buffered events.
 *
 * This drives the same shape the service runner uses: pre-start synchronously
 * (`prepareStreamChatTurn`), then `runTurnGeneration`, which drains the post-start
 * stream into the event log and finalizes via `onExit`. The events a browser
 * would receive are then read back from the log with the `after = -1` convention.
 *
 * A pre-start failure rejects (the turn never started), matching how the route
 * returns a JSON setup error. A post-start runtime failure does not reject: it is
 * mapped to a terminal `sidechat.error` in the log, exactly as a subscriber sees.
 */
export const runStreamChat = (
  streamInput: StreamChatInput,
  ports: ReturnType<typeof createFakePorts>,
): AsyncIterable<SidechatStreamEvent> =>
  effectToAsyncIterable(runTurnToEventLog(streamInput, ports));

/**
 * Lease settings for core tests: the heartbeat interval is far longer than any
 * test run, so the lease is claimed once but never renews or fences. Fencing
 * behavior is exercised by the service runner tests, which control the clock.
 */
export const TEST_TURN_LEASE: TurnLeaseSettings = {
  instanceId: "instance_test",
  leaseTtlMs: 600_000,
  heartbeatIntervalMs: 600_000,
};

const runTurnToEventLog = (
  streamInput: StreamChatInput,
  ports: StreamChatPorts,
): Effect.Effect<readonly SidechatStreamEvent[], unknown> =>
  Effect.gen(function* () {
    const turn = yield* prepareStreamChatTurn(ports, streamInput);
    yield* runTurnGeneration(ports, streamInput, turn, TEST_TURN_LEASE);
    return yield* ports.turnEventLog.readEventsAfter({
      authContext: turn.authContext,
      assistantTurnId: turn.assistantTurnId,
      after: -1,
    });
  });

/**
 * Adapt a one-shot Effect of events into the `AsyncIterable` the tests collect.
 *
 * The whole turn is run once; a failure surfaces on the first `next()` so
 * `collect` rejects for pre-start setup errors just like the old stream did.
 */
const effectToAsyncIterable = (
  effect: Effect.Effect<readonly SidechatStreamEvent[], unknown>,
): AsyncIterable<SidechatStreamEvent> => ({
  async *[Symbol.asyncIterator]() {
    const events = await Effect.runPromise(effect);
    yield* events;
  },
});

export const collect = async <T>(items: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
};

export { isTerminalEvent };
