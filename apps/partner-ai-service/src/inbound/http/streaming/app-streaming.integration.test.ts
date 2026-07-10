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
import { createPostgresDrizzleSidechatRepositories } from "@side-chat/db";
import { Effect, Stream } from "effect";
import { afterAll, describe, expect, it } from "vitest";

import { createPartnerAiServiceApp, type PartnerAiServiceApp } from "../app.js";
import {
  readTurnStream,
  runTurnStream,
  startRun,
} from "#testing/turn-stream/turn-stream-harness.test-support";

const databaseUrl = process.env["SIDECHAT_TEST_DATABASE_URL"];
const AUTH_HEADER = { authorization: "Bearer local-test-token" } as const;

// This suite combines real Postgres turn persistence with the service's
// connection-bound, in-memory stream registry. It runs only when a local test
// database is provided; without one it skips instead of starting a container.
describe.skipIf(!databaseUrl)("partner ai service streaming over postgres", () => {
  const closers: Array<() => Promise<void>> = [];
  afterAll(async () => {
    await Promise.all(closers.map((close) => close()));
  });

  const createApp = (agentRuntime: AiRuntimePort): PartnerAiServiceApp => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl as string,
    });
    closers.push(() => repositories.close());
    return createPartnerAiServiceApp({
      repositories,
      persistence: { kind: "postgres", databaseUrl: databaseUrl as string },
      agentRuntime,
    });
  };

  it("receives started..completed in order on a live registry subscription", async () => {
    // The runtime blocks until released, so the subscription must tail events
    // from the owning instance's registry instead of reading a completed turn.
    const gate = createGate();
    const app = createApp(gatedRuntime(gate.promise));
    const request = uniqueRequest();
    const started = await startRun(app, request);

    const streamPromise = readTurnStream(app, started.assistantTurnId);
    gate.release();
    const events = await streamPromise;

    expect(events.map((event) => event.type)).toEqual([
      SIDECHAT_EVENT_TYPES.STARTED,
      SIDECHAT_EVENT_TYPES.ACTIVITY,
      SIDECHAT_EVENT_TYPES.DELTA,
      SIDECHAT_EVENT_TYPES.COMPLETED,
    ]);
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3]);
  });

  it("replays a completed run from the owning instance's registry and ends", async () => {
    const app = createApp(completedRuntime());
    const { assistantTurnId } = await runTurnStream(app, uniqueRequest());

    const events = await readTurnStream(app, assistantTurnId);
    expect(events.at(0)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.STARTED });
    expect(events.at(-1)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.COMPLETED });
  });

  it("replays only events after the given offset", async () => {
    const app = createApp(completedRuntime());
    const { assistantTurnId } = await runTurnStream(app, uniqueRequest());

    const events = await readTurnStream(app, assistantTurnId, 1);
    expect(events.map((event) => event.sequence)).toEqual([2, 3]);
  });

  it("finalizes the run even when the subscriber disconnects mid-stream", async () => {
    const gate = createGate();
    const app = createApp(gatedRuntime(gate.promise));
    const started = await startRun(app, uniqueRequest());

    const response = await app.request(`/chat/turns/${started.assistantTurnId}/stream?after=-1`, {
      headers: AUTH_HEADER,
    });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();

    gate.release();
    await expect
      .poll(async () => {
        const status = await app.request(`/chat/turns/${started.assistantTurnId}`, {
          headers: AUTH_HEADER,
        });
        return ((await status.json()) as { status: string }).status;
      })
      .toBe("completed");
  });
});

let requestCounter = 0;
const uniqueRequest = (): ChatStreamRequest => {
  requestCounter += 1;
  return {
    protocolVersion: SIDECHAT_PROTOCOL_VERSION,
    requestId: `request_pg_stream_${requestCounter}_${Date.now()}`,
    message: { id: `message_pg_stream_${requestCounter}`, content: "hello postgres stream" },
  };
};

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
    type: RUNTIME_EVENT_TYPES.ACTIVITY,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 0,
    activityId: "activity_pg_stream",
    activityKind: "reasoning",
    status: "completed",
    title: "Postgres stream reasoning",
  },
  {
    type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 1,
    content: "Recorded over postgres.",
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
