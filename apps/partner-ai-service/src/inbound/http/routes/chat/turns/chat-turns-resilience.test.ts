import {
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type AiRuntimePort,
  type AiRuntimeRequest,
  type RuntimeEvent,
} from "@side-chat/ai-runtime-contract";
import {
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  type ChatStreamRequest,
} from "@side-chat/chat-protocol";
import { createMemorySidechatRepositories, type MemorySidechatRepositories } from "@side-chat/db";
import type { ObservabilityLifecycleState, ObservabilityRecord } from "@side-chat/partner-ai-core";
import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { createPartnerAiServiceApp, type PartnerAiServiceApp } from "../../../app.js";
import {
  TEST_SAFETY_POLL_INTERVAL_MS,
  readTurnStream,
  runTurnStream,
  startRun,
} from "#testing/turn-stream/turn-stream-harness.test-support";

const AUTH_HEADER = { authorization: "Bearer local-test-token" } as const;
// A cutoff far in the future, so a completed turn is always outside retention when
// the test prunes its log directly (the run completes at real-time `now`).
const FAR_FUTURE = "2999-01-01T00:00:00.000Z";

const runRequest = (overrides: Partial<ChatStreamRequest> = {}): ChatStreamRequest => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_resilience_001",
  message: { id: "message_resilience_001", content: "hello resilience" },
  ...overrides,
});

describe("GET /chat/turns/:assistantTurnId/stream replay_expired", () => {
  it("returns replay_expired (404 JSON) when a terminal turn's log was pruned past after", async () => {
    const harness = createApp();
    const started = await runTurnStream(harness.app, runRequest());

    // Prune the now-terminal turn's event log; the turn record survives.
    const pruned = await harness.repositories.pruneTurnEventsBefore({
      completedBefore: FAR_FUTURE,
      limit: 10,
    });
    expect(pruned.prunedTurns).toBe(1);

    const response = await harness.app.request(
      `/chat/turns/${started.assistantTurnId}/stream?after=-1`,
      { headers: AUTH_HEADER },
    );
    // 404 + the distinct transport code: the widget maps the 404 to replay_expired
    // and falls back to conversation history.
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      code: "replay_expired",
    });
  });

  it("still replays an unpruned terminal turn over SSE", async () => {
    const harness = createApp();
    const started = await runTurnStream(harness.app, runRequest());

    // No prune: the durable log is intact, so resume replays normally and ends.
    const events = await readTurnStream(harness.app, started.assistantTurnId);
    expect(events.at(0)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.STARTED });
    expect(events.at(-1)).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.COMPLETED,
    });
  });

  it("does not treat a running turn as replay_expired even with an empty log", async () => {
    // A turn whose log is somehow empty but still running must open SSE (the tail
    // will deliver events), never replay_expired.
    const gate = createGate();
    const harness = createApp({ agentRuntime: gatedRuntime(gate.promise) });
    const started = await startRun(harness.app, runRequest());

    const response = await harness.app.request(
      `/chat/turns/${started.assistantTurnId}/stream?after=100`,
      { headers: AUTH_HEADER },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await response.body?.cancel();
    gate.release();
  });
});

describe("resumable lifecycle observability", () => {
  it("records subscriber attach/detach, replay served, and run finished", async () => {
    const records: ObservabilityRecord[] = [];
    const harness = createApp({ observability: spySink(records) });
    const started = await runTurnStream(harness.app, runRequest());

    const states = lifecycleStates(records);
    // A completed run replayed over SSE records: replay served, run finished, and a
    // matched subscriber attach/detach pair.
    expect(states).toContain("replay_served");
    expect(states).toContain("run_finished");
    expect(states).toContain("subscriber_attached");
    expect(states).toContain("subscriber_detached");

    const runFinished = records.find((record) => record.lifecycleState === "run_finished");
    expect(runFinished).toMatchObject({
      assistantTurnId: started.assistantTurnId,
    });
    // Run duration is the durable startedAt -> completedAt span, so it is recorded.
    expect(runFinished?.latencyMs).toBeGreaterThanOrEqual(0);

    const attached = records.find((record) => record.lifecycleState === "subscriber_attached");
    expect(attached?.attributes).toMatchObject({ subscriberCount: 1 });
  });

  it("records replay_expired when the pruned log can no longer replay", async () => {
    const records: ObservabilityRecord[] = [];
    const harness = createApp({ observability: spySink(records) });
    const started = await runTurnStream(harness.app, runRequest());
    await harness.repositories.pruneTurnEventsBefore({
      completedBefore: FAR_FUTURE,
      limit: 10,
    });

    await harness.app.request(`/chat/turns/${started.assistantTurnId}/stream?after=-1`, {
      headers: AUTH_HEADER,
    });

    expect(lifecycleStates(records)).toContain("replay_expired");
  });

  it("records a turn_cancelled observation on the cancel route", async () => {
    const records: ObservabilityRecord[] = [];
    const gate = createGate();
    const harness = createApp({
      observability: spySink(records),
      agentRuntime: gatedRuntime(gate.promise),
    });
    const started = await startRun(harness.app, runRequest());

    await harness.app.request(`/chat/turns/${started.assistantTurnId}/cancel`, {
      method: "POST",
      headers: AUTH_HEADER,
    });

    const cancelled = records.find((record) => record.lifecycleState === "turn_cancelled");
    expect(cancelled).toMatchObject({
      assistantTurnId: started.assistantTurnId,
    });
    expect(cancelled?.attributes).toMatchObject({ cancelRequested: true });

    gate.release();
    await harness.shutdown();
  });
});

type RouteHarness = {
  readonly app: PartnerAiServiceApp;
  readonly repositories: MemorySidechatRepositories;
  readonly shutdown: () => Promise<void>;
};

const createApp = (
  options: {
    readonly agentRuntime?: AiRuntimePort;
    readonly observability?: unknown;
  } = {},
): RouteHarness => {
  const repositories = createMemorySidechatRepositories();
  const service = createPartnerAiServiceApp({
    repositories,
    resumability: { safetyPollIntervalMs: TEST_SAFETY_POLL_INTERVAL_MS },
    agentRuntime: options.agentRuntime ?? completedRuntime(),
    observability: options.observability as never,
  });
  // createPartnerAiServiceApp discards the shutdown; gated tests do not need a clean
  // teardown beyond releasing the gate, so a no-op keeps the harness shape uniform.
  return { app: service, repositories, shutdown: async () => undefined };
};

const spySink = (records: ObservabilityRecord[]) => ({
  record: (record: ObservabilityRecord) =>
    Effect.sync(() => {
      records.push(record);
    }),
});

const lifecycleStates = (records: readonly ObservabilityRecord[]): ObservabilityLifecycleState[] =>
  records.map((record) => record.lifecycleState);

const completedRuntime = (): AiRuntimePort => ({
  streamEffect: (request) => Stream.fromIterable(completedRuntimeEvents(request)),
});

const gatedRuntime = (release: Promise<void>): AiRuntimePort => ({
  streamEffect: (request) =>
    Stream.fromIterable(progressRuntimeEvents(request)).pipe(
      Stream.concat(Stream.fromEffect(Effect.promise(() => release)).pipe(Stream.drain)),
      Stream.concat(Stream.fromIterable([completedRuntimeEvent(request)])),
    ),
});

const completedRuntimeEvents = (request: AiRuntimeRequest): readonly RuntimeEvent[] => [
  ...progressRuntimeEvents(request),
  completedRuntimeEvent(request),
];

const progressRuntimeEvents = (request: AiRuntimeRequest): readonly RuntimeEvent[] => [
  {
    type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 0,
    content: "Recorded by the resilience test.",
  },
];

const completedRuntimeEvent = (request: AiRuntimeRequest): RuntimeEvent => ({
  type: RUNTIME_EVENT_TYPES.COMPLETED,
  requestId: request.requestId,
  assistantTurnId: request.assistantTurnId,
  sequence: 1,
  finishReason: RUNTIME_FINISH_REASONS.STOP,
});

type Gate = { readonly promise: Promise<void>; readonly release: () => void };

const createGate = (): Gate => {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
