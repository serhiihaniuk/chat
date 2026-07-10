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
import type {
  ObservabilityLifecycleState,
  ObservabilityRecord,
  ObservabilitySinkPort,
} from "@side-chat/partner-ai-core";
import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { createDevelopmentPartnerAiServiceApp, type PartnerAiServiceApp } from "../../../app.js";
import {
  TEST_SAFETY_POLL_INTERVAL_MS,
  readTurnStream,
  runTurnStream,
  startRun,
} from "#testing/turn-stream/turn-stream-harness.test-support";

const AUTH_HEADER = { authorization: "Bearer local-test-token" } as const;

const runRequest = (overrides: Partial<ChatStreamRequest> = {}): ChatStreamRequest => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_resilience_001",
  message: { id: "message_resilience_001", content: "hello resilience" },
  ...overrides,
});

/** Run a second turn whose first event sweeps the finished first turn from the registry. */
const sweepRegistry = (app: PartnerAiServiceApp): Promise<unknown> =>
  runTurnStream(
    app,
    runRequest({
      requestId: "request_resilience_sweep",
      message: { id: "message_resilience_sweep", content: "second turn" },
    }),
  );

describe("GET /chat/turns/:assistantTurnId/stream replay_expired", () => {
  it("returns replay_expired (404 JSON) when a finished turn is no longer buffered in the registry", async () => {
    const harness = createApp();
    const started = await runTurnStream(harness.app, runRequest());

    // A second turn sweeps the finished first turn out of the in-memory registry;
    // the turn record survives but its live buffer is gone.
    await sweepRegistry(harness.app);

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

    // The terminal turn remains buffered, so resume replays normally and ends.
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
  it("records replay served and run finished", async () => {
    const records: ObservabilityRecord[] = [];
    const harness = createApp({ observability: spySink(records) });
    const started = await runTurnStream(harness.app, runRequest());
    // Replay telemetry belongs to the resume GET, not the connection-bound POST
    // stream, so resume the finished turn explicitly.
    await readTurnStream(harness.app, started.assistantTurnId);

    const states = lifecycleStates(records);
    // A completed run replayed over SSE records replay served and run finished.
    expect(states).toContain("replay_served");
    expect(states).toContain("run_finished");

    const runFinished = records.find((record) => record.lifecycleState === "run_finished");
    expect(runFinished).toMatchObject({
      assistantTurnId: started.assistantTurnId,
    });
    // Run duration is the durable startedAt -> completedAt span, so it is recorded.
    expect(runFinished?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("records replay_expired when a finished turn is no longer buffered", async () => {
    const records: ObservabilityRecord[] = [];
    const harness = createApp({ observability: spySink(records) });
    const started = await runTurnStream(harness.app, runRequest());
    await sweepRegistry(harness.app);

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
    readonly observability?: ObservabilitySinkPort;
  } = {},
): RouteHarness => {
  const repositories = createMemorySidechatRepositories();
  const service = createDevelopmentPartnerAiServiceApp({
    repositories,
    resumability: { safetyPollIntervalMs: TEST_SAFETY_POLL_INTERVAL_MS },
    agentRuntime: options.agentRuntime ?? completedRuntime(),
    observability: options.observability,
  });
  // createDevelopmentPartnerAiServiceApp discards the shutdown; gated tests do not need a clean
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
