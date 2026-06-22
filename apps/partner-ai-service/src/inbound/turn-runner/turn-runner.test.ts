import {
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type AiRuntimePort,
  type AiRuntimeRequest,
  type RuntimeEvent,
} from "@side-chat/ai-runtime-contract";
import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  isTerminalEvent,
  parseSidechatStreamEvent,
  type ChatStreamRequest,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import {
  createMemorySidechatRepositories,
  type AssistantTurnRecord,
  type MemorySidechatRepositories,
  type TurnEventRecord,
} from "@side-chat/db";
import type { AuthContext, WorkspaceRef } from "@side-chat/partner-ai-core";
import { Stream } from "effect";
import { describe, expect, it } from "vitest";

import { composePartnerAiService, type ResumabilityConfig } from "#composition/service-composition";
import type { TurnRunner } from "./turn-runner.js";

const WORKSPACE: WorkspaceRef = { tenantId: "tenant_runner", workspaceId: "workspace_runner" };

const AUTH_CONTEXT: AuthContext = {
  ...WORKSPACE,
  subject: { subjectId: "subject_runner", userId: "user_runner" },
  actor: { subjectId: "subject_runner", userId: "user_runner" },
  roles: ["member"],
  scopes: ["conversation:read", "conversation:write", "message:write"],
  source: "test_authority",
  issuedAt: "2026-06-21T00:00:00.000Z",
};

const chatRequest = (overrides: Partial<ChatStreamRequest> = {}): ChatStreamRequest => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_runner_001",
  message: { id: "message_runner_001", content: "hello runner" },
  ...overrides,
});

describe("server-owned turn runner", () => {
  it("runs generation to a completed turn server-side with no client or request signal", async () => {
    const harness = createRunnerHarness();

    const started = await harness.runner.start({
      request: chatRequest(),
      authContext: AUTH_CONTEXT,
    });
    await harness.runner.awaitTurn(started.assistantTurnId);

    // Every post-start event was appended to the durable log, ending in completed.
    const events = await readTurnEvents(harness.repositories, started.assistantTurnId);
    expect(events.map((event) => event.type)).toEqual([
      "started",
      "activity",
      "delta",
      "completed",
    ]);
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3]);
    expect(events.filter((event) => isTerminalEvent(eventOf(event)))).toHaveLength(1);

    // The assistant turn reached a durable completed state independent of any socket.
    const turn = requireTurn(harness.repositories, started.assistantTurnId);
    expect(turn.status).toBe("completed");
    expect(started.status).toBe("running");
    expect(started.conversationId).toBe(turn.conversationId);
  });

  it("finalizes a bare interrupt without cancel intent as a non-user provider failure", async () => {
    // A runtime that emits a delta then never terminates keeps the fiber alive
    // until it is interrupted, so onExit owns the terminal. A bare
    // `interruptTurn` (no durable cancel intent) is a shutdown/fence-style stop,
    // not a user abort, so it terminalizes honestly as provider_failed. A real
    // user cancel writes intent first and is covered by the cancel route tests.
    const harness = createRunnerHarness({ runtime: blockingRuntime() });

    const started = await harness.runner.start({
      request: chatRequest(),
      authContext: AUTH_CONTEXT,
    });
    // Wait until the partial events have been drained to the log so the interrupt
    // lands mid-stream; the synthetic terminal then sits after them, not at 0.
    await expect
      .poll(() =>
        readTurnEvents(harness.repositories, started.assistantTurnId).then((e) => e.length),
      )
      .toBeGreaterThanOrEqual(2);
    await harness.runner.interruptTurn(started.assistantTurnId);
    await harness.runner.awaitTurn(started.assistantTurnId);

    const events = await readTurnEvents(harness.repositories, started.assistantTurnId);
    const terminals = events.filter((event) => isTerminalEvent(eventOf(event)));
    expect(terminals).toHaveLength(1);
    const terminal = requireOnly(terminals);
    expect(terminal.type).toBe("error");
    expect(eventOf(terminal)).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.ERROR,
      code: PROTOCOL_ERROR_CODES.TIMEOUT,
      sequence: lastNonTerminalSequence(events) + 1,
    });

    const turn = requireTurn(harness.repositories, started.assistantTurnId);
    expect(turn.status).toBe("provider_failed");
    expect(turn.errorCode).toBe(PROTOCOL_ERROR_CODES.TIMEOUT);
  });

  it("aborts the in-flight provider call when the generation fiber is interrupted", async () => {
    // The runtime captures the abort signal core threads into the request and then
    // blocks, so the fiber stays alive until interrupted. Interruption must abort
    // that captured signal, proving generation (and billing) stops, not just the
    // socket.
    const capture: { signal?: AbortSignal | undefined } = {};
    const harness = createRunnerHarness({ runtime: abortObservingRuntime(capture) });

    const started = await harness.runner.start({
      request: chatRequest(),
      authContext: AUTH_CONTEXT,
    });

    // The provider received a live (not-yet-aborted) signal once streaming opened.
    await expect.poll(() => capture.signal !== undefined).toBe(true);
    expect(capture.signal?.aborted).toBe(false);

    await harness.runner.interruptTurn(started.assistantTurnId);
    await harness.runner.awaitTurn(started.assistantTurnId);

    // Interrupting the fiber aborted the provider's signal.
    expect(capture.signal?.aborted).toBe(true);
  });

  it("is idempotent on requestId: a repeated start resolves to the same turn without a second generation", async () => {
    const harness = createRunnerHarness();
    const request = chatRequest();

    const first = await harness.runner.start({ request, authContext: AUTH_CONTEXT });
    await harness.runner.awaitTurn(first.assistantTurnId);
    const second = await harness.runner.start({ request, authContext: AUTH_CONTEXT });
    await harness.runner.awaitTurn(second.assistantTurnId);

    expect(second.assistantTurnId).toBe(first.assistantTurnId);
    // The replay did not fork a second generation, so the durable log keeps the
    // single completed run with no duplicate terminal and exactly one main
    // generation runtime call (the conversation-title job is excluded).
    const events = await readTurnEvents(harness.repositories, first.assistantTurnId);
    expect(events.filter((event) => isTerminalEvent(eventOf(event)))).toHaveLength(1);
    expect(mainGenerationRequests(harness.runtimeRequests)).toHaveLength(1);
  });

  it("interrupts in-flight generation on shutdown and finalizes it as a non-user terminal", async () => {
    const harness = createRunnerHarness({ runtime: blockingRuntime() });

    const started = await harness.runner.start({
      request: chatRequest(),
      authContext: AUTH_CONTEXT,
    });
    await harness.runner.shutdown();
    await harness.runner.awaitTurn(started.assistantTurnId);

    // Closing the runner scope interrupted the fiber, so onExit still owned the
    // one terminal. Shutdown is not a user cancel (no durable intent), so the
    // honest durable status is provider_failed, not user_aborted. The onExit
    // finalizer settles just after the interrupted fiber detaches, so poll the
    // durable status rather than reading a single snapshot.
    await expect
      .poll(() => requireTurn(harness.repositories, started.assistantTurnId).status)
      .toBe("provider_failed");
    const events = await readTurnEvents(harness.repositories, started.assistantTurnId);
    expect(events.filter((event) => isTerminalEvent(eventOf(event)))).toHaveLength(1);
  });

  it("heartbeats the owner lease while generation runs", async () => {
    // A blocking runtime keeps the fiber alive so the heartbeat keeps renewing the
    // lease. The renew is epoch-scoped, so a live owner advances its expiry without
    // changing the epoch it acquired.
    const harness = createRunnerHarness({ runtime: blockingRuntime(), resumability: FAST_LEASE });

    const started = await harness.runner.start({
      request: chatRequest(),
      authContext: AUTH_CONTEXT,
    });

    // The lease is claimed at epoch 1; the owner keeps renewing it (so its expiry
    // keeps moving forward) without the epoch drifting.
    await expect
      .poll(() => requireTurn(harness.repositories, started.assistantTurnId).ownerInstanceId)
      .toBe(FAST_LEASE.instanceId);
    const firstExpiry = requireTurn(harness.repositories, started.assistantTurnId).leaseExpiresAt;
    await expect
      .poll(() => requireTurn(harness.repositories, started.assistantTurnId).leaseExpiresAt)
      .not.toBe(firstExpiry);
    expect(requireTurn(harness.repositories, started.assistantTurnId).leaseEpoch).toBe(1);
    expect(requireTurn(harness.repositories, started.assistantTurnId).status).toBe("running");

    await harness.shutdown();
  });

  it("self-interrupts and finalizes when its lease is fenced underneath it", async () => {
    // While the owner generates, a competing acquire steals the lease and bumps the
    // epoch. The owner's next heartbeat renew fails (it holds a stale epoch), so it
    // interrupts its own generation and finalizes — a fence is a non-user stop, so
    // the honest terminal is provider_failed/timeout, not user_aborted.
    const harness = createRunnerHarness({ runtime: blockingRuntime(), resumability: FAST_LEASE });

    const started = await harness.runner.start({
      request: chatRequest(),
      authContext: AUTH_CONTEXT,
    });
    await expect
      .poll(() => requireTurn(harness.repositories, started.assistantTurnId).ownerInstanceId)
      .toBe(FAST_LEASE.instanceId);

    // A different instance steals the lease, fencing the running owner.
    await harness.repositories.acquireTurnLease({
      workspaceId: WORKSPACE.workspaceId,
      assistantTurnId: started.assistantTurnId,
      ownerInstanceId: "instance_thief",
      leaseTtlMs: 60_000,
      now: new Date().toISOString(),
    });

    // The fenced owner stops its own generation and finalizes it as a non-user
    // provider failure (the steal left no cancel intent).
    await expect
      .poll(() => requireTurn(harness.repositories, started.assistantTurnId).status)
      .toBe("provider_failed");
    const events = await readTurnEvents(harness.repositories, started.assistantTurnId);
    const terminals = events.filter((event) => isTerminalEvent(eventOf(event)));
    expect(terminals).toHaveLength(1);
    expect(eventOf(requireOnly(terminals))).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.ERROR,
      code: PROTOCOL_ERROR_CODES.TIMEOUT,
    });

    await harness.shutdown();
  });
});

type RunnerHarness = {
  readonly runner: TurnRunner;
  readonly repositories: MemorySidechatRepositories;
  readonly runtimeRequests: readonly AiRuntimeRequest[];
  /** Stop every composed background owner (runner, reaper, listeners) for cleanup. */
  readonly shutdown: () => Promise<void>;
};

type HarnessOptions = {
  readonly runtime?: AiRuntimePort | undefined;
  readonly resumability?: ResumabilityConfig | undefined;
};

const createRunnerHarness = ({ runtime, resumability }: HarnessOptions = {}): RunnerHarness => {
  const repositories = createMemorySidechatRepositories();
  const runtimeRequests: AiRuntimeRequest[] = [];
  const composition = composePartnerAiService({
    workspace: WORKSPACE,
    repositories,
    agentRuntime: runtime ?? completedRuntime(runtimeRequests),
    resumability,
  });
  return {
    runner: composition.turnRunner,
    repositories,
    runtimeRequests,
    shutdown: composition.shutdown,
  };
};

// A fast lease so the heartbeat fires within a test: the owner renews every few
// ms and a fence is observed almost immediately after the epoch is bumped.
const FAST_LEASE: ResumabilityConfig = {
  safetyPollIntervalMs: 1_000,
  instanceId: "instance_runner_owner",
  leaseTtlMs: 1_000,
  heartbeatIntervalMs: 20,
  reaperIntervalMs: 1_000,
  reaperBatchLimit: 50,
  turnEventRetentionMs: 60_000,
  prunerIntervalMs: 1_000,
  prunerBatchLimit: 100,
};

const completedRuntime = (runtimeRequests: AiRuntimeRequest[]): AiRuntimePort => ({
  streamEffect: (request) => {
    runtimeRequests.push(request);
    return Stream.fromIterable(completedRuntimeEvents(request));
  },
});

const blockingRuntime = (): AiRuntimePort => ({
  streamEffect: (request) =>
    Stream.concat(
      Stream.fromIterable([
        startedRuntimeEvent(request),
        {
          type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
          requestId: request.requestId,
          assistantTurnId: request.assistantTurnId,
          sequence: 1,
          content: "partial",
        },
      ]),
      Stream.never,
    ),
});

// Captures the abort signal core threads into the runtime request, then blocks so
// the fiber stays alive until interrupted. Mirrors how the real AI SDK adapter
// receives `request.abortSignal` and ties it to the in-flight provider call.
const abortObservingRuntime = (capture: { signal?: AbortSignal | undefined }): AiRuntimePort => ({
  streamEffect: (request) => {
    capture.signal = request.abortSignal;
    return Stream.concat(Stream.fromIterable([startedRuntimeEvent(request)]), Stream.never);
  },
});

const startedRuntimeEvent = (request: AiRuntimeRequest): RuntimeEvent => ({
  type: RUNTIME_EVENT_TYPES.STARTED,
  requestId: request.requestId,
  assistantTurnId: request.assistantTurnId,
  sequence: 0,
  providerId: request.providerId,
  modelId: request.modelId,
});

const completedRuntimeEvents = (request: AiRuntimeRequest): readonly RuntimeEvent[] => [
  {
    type: RUNTIME_EVENT_TYPES.ACTIVITY,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 0,
    activityId: "activity_runner_001",
    activityKind: "reasoning",
    status: "completed",
    title: "Runner selected deterministic response",
  },
  {
    type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 1,
    content: "Recorded by the runner.",
  },
  {
    type: RUNTIME_EVENT_TYPES.COMPLETED,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 2,
    finishReason: RUNTIME_FINISH_REASONS.STOP,
    usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
  },
];

const readTurnEvents = (
  repositories: MemorySidechatRepositories,
  assistantTurnId: string,
): Promise<readonly TurnEventRecord[]> =>
  repositories.readTurnEventsAfter({
    workspaceId: WORKSPACE.workspaceId,
    assistantTurnId,
    after: -1,
  });

// The durable assistant-turn record is read from the memory store snapshot,
// since the repository contract exposes no by-id turn read.
const requireTurn = (
  repositories: MemorySidechatRepositories,
  assistantTurnId: string,
): AssistantTurnRecord => {
  const turn = repositories
    .snapshot()
    .assistantTurns.find((candidate) => candidate.assistantTurnId === assistantTurnId);
  if (!turn) throw new Error(`Assistant turn ${assistantTurnId} was not persisted.`);
  return turn;
};

// Exclude the conversation-title auxiliary job so assertions count only the main
// assistant-turn generation runtime call.
const mainGenerationRequests = (
  requests: readonly AiRuntimeRequest[],
): readonly AiRuntimeRequest[] =>
  requests.filter((request) => !request.requestId.endsWith(":conversation-title"));

// Narrow a single-element terminal slice to its sole record so its event can be
// asserted without an index-access undefined under noUncheckedIndexedAccess.
const requireOnly = (records: readonly TurnEventRecord[]): TurnEventRecord => {
  const [only] = records;
  if (!only) throw new Error("Expected exactly one terminal event.");
  return only;
};

// Decode the stored protocol-free payload back into the typed event the way the
// persistence adapter does, so assertions read the same rehydrated union the
// runner would hand a subscriber.
const eventOf = (record: TurnEventRecord): SidechatStreamEvent =>
  parseSidechatStreamEvent(record.payloadJson);

const lastNonTerminalSequence = (events: readonly TurnEventRecord[]): number =>
  Math.max(
    ...events.filter((event) => !isTerminalEvent(eventOf(event))).map((event) => event.sequence),
  );
