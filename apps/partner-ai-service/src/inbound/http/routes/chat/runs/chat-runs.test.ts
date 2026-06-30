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
import { Stream } from "effect";
import { describe, expect, it } from "vitest";

import { createPartnerAiServiceApp } from "../../../app.js";
import { readTurnStream } from "#testing/turn-stream/turn-stream-harness.test-support";

const AUTH_HEADER = { authorization: "Bearer local-test-token" } as const;

const runRequest = (overrides: Partial<ChatStreamRequest> = {}): ChatStreamRequest => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_runs_route_001",
  message: { id: "message_runs_route_001", content: "hello runs route" },
  ...overrides,
});

describe("POST /chat/runs", () => {
  it("accepts a turn, returns its identity as JSON, and runs generation to a completed turn", async () => {
    const harness = createRouteHarness();

    const response = await postRun(harness.app, runRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      requestId: "request_runs_route_001",
      status: "running",
    });
    expect(typeof body["assistantTurnId"]).toBe("string");
    expect(typeof body["conversationId"]).toBe("string");

    // No SSE consumed the run while it generated, yet it finishes server-side and
    // its events remain replayable from the in-memory registry: subscribing after
    // the fact replays started..completed before the buffer is swept.
    const assistantTurnId = body["assistantTurnId"] as string;
    const events = await readTurnStream(harness.app, assistantTurnId);
    expect(events.map((event) => event.type)).toEqual([
      SIDECHAT_EVENT_TYPES.STARTED,
      SIDECHAT_EVENT_TYPES.ACTIVITY,
      SIDECHAT_EVENT_TYPES.DELTA,
      SIDECHAT_EVENT_TYPES.COMPLETED,
    ]);

    const turn = harness.repositories
      .snapshot()
      .assistantTurns.find((candidate) => candidate.assistantTurnId === assistantTurnId);
    expect(turn?.status).toBe("completed");
  });

  it("rejects a malformed body as a JSON bad-request without opening a run", async () => {
    const harness = createRouteHarness();

    const response = await harness.app.request("/chat/runs", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: "{ not json",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["code"]).toBe("bad_request");
    expect(harness.repositories.snapshot().assistantTurns).toHaveLength(0);
  });
});

type RouteHarness = {
  readonly app: ReturnType<typeof createPartnerAiServiceApp>;
  readonly repositories: MemorySidechatRepositories;
};

const createRouteHarness = (): RouteHarness => {
  const repositories = createMemorySidechatRepositories();
  return {
    repositories,
    app: createPartnerAiServiceApp({
      repositories,
      agentRuntime: completedRuntime(),
    }),
  };
};

const postRun = (
  app: ReturnType<typeof createPartnerAiServiceApp>,
  request: ChatStreamRequest,
): Promise<Response> =>
  // Hono's `app.request` is typed `Response | Promise<Response>`; normalize to a
  // promise so callers can always await one shape.
  Promise.resolve(
    app.request("/chat/runs", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify(request),
    }),
  );

const completedRuntime = (): AiRuntimePort => ({
  streamEffect: (request) => Stream.fromIterable(completedRuntimeEvents(request)),
});

const completedRuntimeEvents = (request: AiRuntimeRequest): readonly RuntimeEvent[] => [
  {
    type: RUNTIME_EVENT_TYPES.ACTIVITY,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 0,
    activityId: "activity_runs_route_001",
    activityKind: "reasoning",
    status: "completed",
    title: "Runs route selected deterministic response",
  },
  {
    type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 1,
    content: "Recorded by the runs route.",
  },
  {
    type: RUNTIME_EVENT_TYPES.COMPLETED,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 2,
    finishReason: RUNTIME_FINISH_REASONS.STOP,
  },
];
