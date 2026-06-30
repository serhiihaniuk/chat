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

const runRequest = (overrides: Partial<ChatStreamRequest> = {}): ChatStreamRequest => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_turns_001",
  message: { id: "message_turns_001", content: "hello turns" },
  ...overrides,
});

describe("GET /chat/turns/:assistantTurnId/stream", () => {
  it("replays started..completed in order for a turn started via POST /chat/runs", async () => {
    const { events } = await runTurnStream(createApp().app, runRequest());

    expect(events.map((event) => event.type)).toEqual([
      SIDECHAT_EVENT_TYPES.STARTED,
      SIDECHAT_EVENT_TYPES.ACTIVITY,
      SIDECHAT_EVENT_TYPES.DELTA,
      SIDECHAT_EVENT_TYPES.COMPLETED,
    ]);
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3]);
  });

  it("replays an already-completed run from the durable log and ends", async () => {
    const app = createApp().app;
    const started = await startRun(app, runRequest());
    // Let generation finish first, then subscribe: the stream must replay the full
    // log and end without needing any live tail.
    await waitForCompletedTurn(app, started.assistantTurnId);

    const events = await readTurnStream(app, started.assistantTurnId);
    expect(events.at(0)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.STARTED });
    expect(events.at(-1)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.COMPLETED });
  });

  it("replays only events after the given offset", async () => {
    const app = createApp().app;
    const started = await startRun(app, runRequest());
    await waitForCompletedTurn(app, started.assistantTurnId);

    // after=1 drops started(0) and activity(1); the gate keeps sequence > 1.
    const events = await readTurnStream(app, started.assistantTurnId, 1);
    expect(events.map((event) => event.sequence)).toEqual([2, 3]);
    expect(events.at(0)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.DELTA });
    expect(events.at(-1)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.COMPLETED });
  });

  it("does not stop the run from finalizing when a subscriber disconnects", async () => {
    // A runtime that blocks before completing, released only after the subscriber
    // has disconnected, proves the generation fiber is independent of the socket.
    const gate = createGate();
    const harness = createApp({ agentRuntime: gatedRuntime(gate.promise) });
    const started = await startRun(harness.app, runRequest());

    // Open the stream, read the first frame, then abort the request mid-stream.
    const abort = new AbortController();
    const streamResponse = await harness.app.request(
      `/chat/turns/${started.assistantTurnId}/stream?after=-1`,
      { headers: AUTH_HEADER, signal: abort.signal },
    );
    const reader = streamResponse.body!.getReader();
    await reader.read();
    await reader.cancel();
    abort.abort();

    // Release generation only now; finalization must still reach a completed turn.
    gate.release();
    await waitForCompletedTurn(harness.app, started.assistantTurnId);
    expect(turnStatus(harness.repositories, started.assistantTurnId)).toBe("completed");
  });

  it("returns a JSON 404 for an unknown turn before opening SSE", async () => {
    const response = await createApp().app.request("/chat/turns/assistant_turn_missing/stream", {
      headers: AUTH_HEADER,
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({ code: "not_found" });
  });
});

describe("GET /chat/runs/:requestId", () => {
  it("resolves a request id to its assistant turn identity", async () => {
    const app = createApp().app;
    const started = await startRun(app, runRequest({ requestId: "request_resolve_001" }));

    const response = await app.request("/chat/runs/request_resolve_001", { headers: AUTH_HEADER });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      assistantTurnId: started.assistantTurnId,
    });
  });

  it("returns 404 for an unknown request id", async () => {
    const response = await createApp().app.request("/chat/runs/request_unknown", {
      headers: AUTH_HEADER,
    });
    expect(response.status).toBe(404);
  });
});

describe("GET /chat/conversations/:id", () => {
  it("returns the active turn while a run is in flight", async () => {
    const gate = createGate();
    const harness = createApp({ agentRuntime: gatedRuntime(gate.promise) });
    const started = await startRun(harness.app, runRequest());

    const response = await harness.app.request(`/chat/conversations/${started.conversationId}`, {
      headers: AUTH_HEADER,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      conversationId: started.conversationId,
      activeTurn: { assistantTurnId: started.assistantTurnId, status: "running" },
    });

    gate.release();
    await waitForCompletedTurn(harness.app, started.assistantTurnId);
  });

  it("reports no active turn once the run has completed", async () => {
    const app = createApp().app;
    const started = await startRun(app, runRequest());
    await waitForCompletedTurn(app, started.assistantTurnId);

    const response = await app.request(`/chat/conversations/${started.conversationId}`, {
      headers: AUTH_HEADER,
    });
    await expect(response.json()).resolves.toMatchObject({ activeTurn: null });
  });
});

describe("POST /chat/turns/:assistantTurnId/host-commands/:commandId/result", () => {
  const postResult = (app: PartnerAiServiceApp, path: string, body: string): Promise<Response> =>
    Promise.resolve(
      app.request(path, {
        method: "POST",
        headers: { ...AUTH_HEADER, "content-type": "application/json" },
        body,
      }),
    );

  it("returns 404 for an unknown turn", async () => {
    const response = await postResult(
      createApp().app,
      "/chat/turns/assistant_turn_missing/host-commands/cmd_1/result",
      "{}",
    );
    expect(response.status).toBe(404);
  });

  it("rejects a non-object result body as a bad request", async () => {
    const app = createApp().app;
    const started = await startRun(app, runRequest());
    const response = await postResult(
      app,
      `/chat/turns/${started.assistantTurnId}/host-commands/cmd_1/result`,
      "[]",
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 when no host command is awaiting the id", async () => {
    const app = createApp().app;
    const started = await startRun(app, runRequest());
    const response = await postResult(
      app,
      `/chat/turns/${started.assistantTurnId}/host-commands/cmd_unknown/result`,
      "{}",
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "not_found" });
  });
});

type RouteHarness = {
  readonly app: PartnerAiServiceApp;
  readonly repositories: MemorySidechatRepositories;
};

const createApp = (options: { readonly agentRuntime?: AiRuntimePort } = {}): RouteHarness => {
  const repositories = createMemorySidechatRepositories();
  return {
    repositories,
    app: createPartnerAiServiceApp({
      repositories,
      resumability: { safetyPollIntervalMs: TEST_SAFETY_POLL_INTERVAL_MS },
      agentRuntime: options.agentRuntime ?? completedRuntime(),
    }),
  };
};

/** A runtime that emits a deterministic activity, delta, and completion. */
const completedRuntime = (): AiRuntimePort => ({
  streamEffect: (request) => Stream.fromIterable(completedRuntimeEvents(request)),
});

/** A runtime that waits for an external gate before completing. */
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
    type: RUNTIME_EVENT_TYPES.ACTIVITY,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 0,
    activityId: "activity_turns_001",
    activityKind: "reasoning",
    status: "completed",
    title: "Turns route reasoning",
  },
  {
    type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 1,
    content: "Recorded by the turns route.",
  },
];

const completedRuntimeEvent = (request: AiRuntimeRequest): RuntimeEvent => ({
  type: RUNTIME_EVENT_TYPES.COMPLETED,
  requestId: request.requestId,
  assistantTurnId: request.assistantTurnId,
  sequence: 2,
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

const turnStatus = (
  repositories: MemorySidechatRepositories,
  assistantTurnId: string,
): string | undefined =>
  repositories.snapshot().assistantTurns.find((turn) => turn.assistantTurnId === assistantTurnId)
    ?.status;

const waitForCompletedTurn = async (
  app: PartnerAiServiceApp,
  assistantTurnId: string,
): Promise<void> => {
  await expect
    .poll(async () => {
      const response = await app.request(`/chat/turns/${assistantTurnId}`, {
        headers: AUTH_HEADER,
      });
      return ((await response.json()) as { status: string }).status;
    })
    .toBe("completed");
};
