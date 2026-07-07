import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import {
  RUNTIME_ERROR_CODES,
  RUNTIME_EVENT_TYPES,
  type RuntimeEvent,
} from "@side-chat/ai-runtime-contract";
import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { prepareStreamChatTurn } from "#application/stream-chat/turn/prepare-stream-chat-turn";
import { runTurnGeneration } from "#application/stream-chat/protocol/run-turn-generation";
import { TEST_TURN_LEASE } from "#testing/fake-ports.test-support";
import type { AuthContext } from "#domain/authority";
import {
  CONTEXT_ADMISSION_POLICIES,
  CONTEXT_ADMISSION_SELECTION_MODES,
  HOST_CAPABILITY_SCHEMA_VERSIONS,
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
  resolveTurnProfileFromManifest,
  type TurnProfile,
  type HostCapabilityManifest,
} from "#domain/capabilities-contract";
import {
  createRequestCorrelation,
  redactAttributes,
  type ObservabilityRecord,
} from "./observability.js";
import {
  DISABLED_CONVERSATION_TITLE_GENERATION,
  type AiRuntimePort,
  type ClockPort,
  type ConversationRepositoryPort,
  type IdGeneratorPort,
  type TurnEventLogPort,
} from "#ports";
import type { StreamChatInput, StreamChatPorts } from "#application/stream-chat/stream-chat-types";

const authContext: AuthContext = {
  tenantId: "tenant_001",
  workspaceId: "workspace_001",
  subject: { subjectId: "subject_001", userId: "user_001" },
  actor: { subjectId: "subject_001", userId: "user_001" },
  source: "test_authority",
  issuedAt: "2026-05-23T13:00:00.000Z",
};

const input: StreamChatInput = {
  workspace: { tenantId: "tenant_001", workspaceId: "workspace_001" },
  hostAppId: "host_app_001",
  request: {
    protocolVersion: SIDECHAT_PROTOCOL_VERSION,
    requestId: "request_observe_1",
    message: {
      id: "message_001",
      content: "secret prompt should not be logged",
    },
  },
  authContext,
  traceId: "trace-explicit-1",
};

describe("observability redaction and correlation", () => {
  it("redacts prompts, tool data, provider output, and secrets", () => {
    expect(
      redactAttributes({
        requestId: "request_1",
        prompt: "hidden prompt",
        authorization: "Bearer secret",
        tool: { argumentsJson: { query: "hidden query" } },
        provider: { output: "hidden output" },
      }),
    ).toEqual({
      requestId: "request_1",
      prompt: "[redacted]",
      authorization: "[redacted]",
      tool: { argumentsJson: "[redacted]" },
      provider: { output: "[redacted]" },
    });
  });

  it("creates deterministic trace correlation when callers omit trace id", () => {
    expect(createRequestCorrelation({ requestId: "request_1" })).toEqual({
      requestId: "request_1",
      traceId: "trace_request_1",
    });
  });

  it("records lifecycle, provider, latency, and redacted runtime data", async () => {
    const records: ObservabilityRecord[] = [];
    const ports = createObservedPorts(records, [
      {
        type: RUNTIME_EVENT_TYPES.ACTIVITY,
        requestId: "request_observe_1",
        assistantTurnId: "assistant_turn_001",
        sequence: 0,
        activityId: "tool_001",
        activityKind: "tool",
        status: "running",
        title: "Run search",
        details: {
          tool: {
            toolCallId: "tool_001",
            toolName: "search",
            input: { query: "secret tool query" },
            result: { summary: "secret search result" },
            sources: [{ label: "Secret source", url: "https://secret.example/result" }],
          },
        },
      },
      {
        type: RUNTIME_EVENT_TYPES.ERROR,
        requestId: "request_observe_1",
        assistantTurnId: "assistant_turn_001",
        sequence: 1,
        code: RUNTIME_ERROR_CODES.TIMEOUT,
        message: "provider leaked secret detail",
        retryable: true,
      },
    ]);

    const events = await runObservedTurn(input, { ...ports, turnGuards: { guards: [] } });

    expect(events.at(-1)).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.ERROR,
      code: PROTOCOL_ERROR_CODES.TIMEOUT,
    });
    expect(records.map((record) => record.lifecycleState)).toEqual([
      "received",
      "started",
      "runtime_event",
      "runtime_event",
      "failed",
    ]);
    expect(records.every((record) => record.requestId === input.request.requestId)).toBe(true);
    expect(records.every((record) => record.traceId === "trace-explicit-1")).toBe(true);
    expect(records.find((record) => record.lifecycleState === "started")).toMatchObject({
      assistantTurnId: "assistant_turn_001",
      providerId: "fake",
      modelId: "fake-echo",
      attributes: {
        prompt: "[redacted]",
      },
    });
    expect(records.find((record) => record.lifecycleState === "runtime_event")).toMatchObject({
      attributes: {
        activityMeta: {
          tool: {
            parametersPresent: true,
            responsePresent: true,
            sourceCount: 1,
            toolCallId: "tool_001",
            toolName: "search",
          },
        },
      },
    });
    expect(JSON.stringify(records)).not.toContain("secret tool query");
    expect(JSON.stringify(records)).not.toContain("secret search result");
    expect(JSON.stringify(records)).not.toContain("secret.example");
    expect(
      records.find(
        (record) =>
          record.lifecycleState === "runtime_event" &&
          record.attributes["errorCode"] === RUNTIME_ERROR_CODES.TIMEOUT,
      ),
    ).toMatchObject({
      attributes: { message: "[redacted]" },
    });
    expect(records.at(-1)).toMatchObject({
      lifecycleState: "failed",
      errorCode: PROTOCOL_ERROR_CODES.TIMEOUT,
      // 14 stepping-clock reads (10ms each) elapse before the failed observation,
      // including the conversation and user-message record clocks and the one
      // owner-lease acquire read, all sourced from ports.clock.now() rather than
      // from auth issuedAt.
      latencyMs: 140,
      attributes: { eventCount: 3 },
    });
  });
});

const createObservedPorts = (
  records: ObservabilityRecord[],
  runtimeEvents: readonly RuntimeEvent[],
) => {
  const clock = createSteppingClock();
  const manifest = createManifest();
  const profile = resolveProfile(manifest);
  const policyDecision = createTurnPolicyDecision({
    manifest,
    profile,
    manifestHash: hashHostCapabilityManifest(manifest),
  });
  const conversations: ConversationRepositoryPort = {
    ensureConversation: ({ authContext: context, fallbackConversationId }) =>
      Effect.succeed({
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        conversationId: fallbackConversationId,
      }),
    appendUserMessage: () =>
      Effect.succeed({
        tenantId: "tenant_001",
        workspaceId: "workspace_001",
        conversationId: "conversation_001",
        messageId: "message_record_001",
        sequenceIndex: 0,
      }),
    prepareConversationTitle: () => Effect.succeed(undefined),
  };
  const assistantTurns = {
    startAssistantTurn: () =>
      Effect.succeed({
        tenantId: "tenant_001",
        workspaceId: "workspace_001",
        conversationId: "conversation_001",
        assistantTurnId: "assistant_turn_001",
        status: "running" as const,
        inserted: true,
      }),
    recordContextSnapshot: () => Effect.succeed(undefined),
    completeAssistantTurn: () => Effect.succeed(undefined),
    failAssistantTurn: () => Effect.succeed(undefined),
    readTurnControlState: () =>
      Effect.succeed({ status: "running" as const, cancelRequested: false }),
    findActiveConversationTurn: () => Effect.succeed(undefined),
    acquireTurnLease: () => Effect.succeed({ acquired: true, leaseEpoch: 1 }),
    renewTurnLease: () => Effect.succeed({ renewed: true }),
  };
  const runtime: AiRuntimePort = {
    streamEffect: () => Stream.fromIterable(runtimeEvents),
  };
  const ids: IdGeneratorPort = {
    nextConversationId: () => "conversation_001",
    nextEventId: (() => {
      let index = 0;
      return () => {
        index += 1;
        return `event_${index.toString().padStart(3, "0")}`;
      };
    })(),
  };

  return {
    conversations,
    assistantTurns,
    turnEventLog: createTurnEventLogPort(),
    conversationTitleGeneration: DISABLED_CONVERSATION_TITLE_GENERATION,
    turnActivityHistory: "full" as const,
    hostCapabilities: { loadManifest: () => Effect.succeed(manifest) },
    turnPolicies: { resolveTurnPolicy: () => Effect.succeed(policyDecision) },
    contextManager: {
      prepareTurnContext: () =>
        Effect.succeed({
          contextId: "context_observe_1",
          profile,
          policyDecision,
          history: emptyHistoryManifest,
          candidates: [],
          runtimeMessages: [
            { role: "user" as const, content: "secret prompt should not be logged" },
          ],
          contextBoard: {
            sections: [],
            manifest: {
              manifestId: "context_manifest_observe_1",
              manifestHash: "sha256:context_observe_1",
              profileId: profile.profileId,
              profileVersion: profile.version,
              entries: [],
              history: emptyHistoryManifest,
              budget: {
                policyId: CONTEXT_ADMISSION_POLICIES.DETERMINISTIC_V1,
                selectionMode: CONTEXT_ADMISSION_SELECTION_MODES.INCLUDE_ALL,
                maxInputTokens: 4096,
                reservedOutputTokens: 512,
                sourceTokenBudgets: {
                  history: 1000,
                },
                includedCandidateIds: [],
                droppedCandidateIds: [],
              },
              createdAt: "2026-05-23T13:00:00.000Z",
            },
          },
        }),
    },
    runtime,
    clock,
    ids,
    policies: {
      evaluate: () => Effect.succeed({ allowed: true } as const),
    },
    observability: {
      record: (record: ObservabilityRecord) =>
        Effect.sync(() => {
          records.push(record);
        }),
    },
  };
};

const createManifest = (): HostCapabilityManifest => ({
  schemaVersion: HOST_CAPABILITY_SCHEMA_VERSIONS.V1,
  hostAppId: "host_app_001",
  defaultTurnProfileId: "analyst",
  turnProfiles: [createProfile()],
  tools: [],
  commands: [],
  approvalPolicies: [],
  activityRenderers: [],
});

const createProfile = (): TurnProfile => ({
  profileId: "analyst",
  version: "2026-06-13",
  displayName: "Analyst",
  systemPromptId: "prompt_analyst_v1",
  systemInstructions: "Use concise analyst language.",
  executorId: "ai_sdk.tool_loop",
  modelPolicy: { providerId: "fake", modelId: "fake-echo" },
  defaultToolPolicy: { mode: "closed", allowedToolNames: [] },
  outputContract: { format: "markdown" },
  safetyPolicy: { policyId: "standard", promptInjectionMode: "standard", turnGuardIds: [] },
});

const resolveProfile = (manifest: HostCapabilityManifest): TurnProfile => {
  const resolution = resolveTurnProfileFromManifest(manifest, "analyst");
  if (!resolution.resolved) {
    throw new Error(resolution.issue.message);
  }
  return resolution.profile;
};

const emptyHistoryManifest = {
  policyMode: "disabled" as const,
  consideredMessageCount: 0,
  admittedMessageCount: 0,
  droppedMessageCount: 0,
  estimatedTokens: 0,
  messages: [],
};

// In-memory turn-event log: observability assertions never read it back, so the
// port only needs to satisfy the layer with the same `sequence > after` reads as
// the durable adapter.
const createTurnEventLogPort = (): TurnEventLogPort => {
  const appendedEvents: SidechatStreamEvent[] = [];
  return {
    appendEvent: ({ event }) =>
      Effect.sync(() => {
        appendedEvents.push(event);
      }),
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
  };
};

const createSteppingClock = (): ClockPort => {
  let tick = -1;
  return {
    now: () => {
      tick += 1;
      return new Date(Date.UTC(2026, 4, 23, 13, 0, 0, tick * 10)).toISOString();
    },
  };
};

/**
 * Run one turn through the server-owned path and read its durable events back.
 *
 * Observability is a side effect of `runTurnGeneration`: pre-start records the
 * received/started observations, the post-start stream records runtime events,
 * and `onExit` records the terminal (`failed` here). Reading the log back proves
 * the browser-visible events match what was observed.
 */
const runObservedTurn = (
  streamInput: StreamChatInput,
  ports: StreamChatPorts,
): Promise<readonly SidechatStreamEvent[]> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const turn = yield* prepareStreamChatTurn(ports, streamInput);
      yield* runTurnGeneration(ports, streamInput, turn, TEST_TURN_LEASE);
      return yield* ports.turnEventLog.readEventsAfter({
        authContext: turn.authContext,
        assistantTurnId: turn.assistantTurnId,
        after: -1,
      });
    }),
  );
