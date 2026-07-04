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
  decodeSseEvents,
  type ChatStreamRequest,
} from "@side-chat/chat-protocol";
import { createMemorySidechatRepositories, type MemorySidechatRepositories } from "@side-chat/db";
import { Stream } from "effect";
import { describe, expect, it, vi } from "vitest";

import { createPartnerAiServiceApp } from "../../../app.js";
import { startRun } from "#testing/turn-stream/turn-stream-harness.test-support";

const AUTH_HEADER = { authorization: "Bearer local-test-token" } as const;

const runRequest = (overrides: Partial<ChatStreamRequest> = {}): ChatStreamRequest => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_runs_route_001",
  message: { id: "message_runs_route_001", content: "hello runs route" },
  ...overrides,
});

describe("POST /chat/runs", () => {
  it("streams the turn on the POST response: started carries identity, then events to the terminal", async () => {
    const harness = createRouteHarness();

    const response = await postRun(harness.app, runRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const events = decodeSseEvents(await response.text());
    expect(events.map((event) => event.type)).toEqual([
      SIDECHAT_EVENT_TYPES.STARTED,
      SIDECHAT_EVENT_TYPES.ACTIVITY,
      SIDECHAT_EVENT_TYPES.DELTA,
      SIDECHAT_EVENT_TYPES.COMPLETED,
    ]);

    // The started frame at sequence 0 is the turn identity: assistantTurnId on
    // the envelope, conversationId on the event, requestId known to the caller.
    const started = events[0];
    expect(started?.type).toBe(SIDECHAT_EVENT_TYPES.STARTED);
    expect(started?.sequence).toBe(0);
    const assistantTurnId = started?.assistantTurnId as string;
    expect(typeof assistantTurnId).toBe("string");
    expect(started && "conversationId" in started && started.conversationId).toBeTruthy();

    const turn = harness.repositories
      .snapshot()
      .assistantTurns.find((candidate) => candidate.assistantTurnId === assistantTurnId);
    expect(turn?.status).toBe("completed");
  });

  it("replays the same turn for a repeated requestId without forking a second generation", async () => {
    const harness = createRouteHarness();
    const request = runRequest({ requestId: "request_runs_idempotent_001" });

    const first = decodeSseEvents(await (await postRun(harness.app, request)).text());
    const second = decodeSseEvents(await (await postRun(harness.app, request)).text());

    // One durable turn; the replay streams the identical event sequence from the
    // registry buffer instead of generating again.
    expect(harness.repositories.snapshot().assistantTurns).toHaveLength(1);
    expect(second.map((event) => event.type)).toEqual(first.map((event) => event.type));
    expect(second[0]?.assistantTurnId).toBe(first[0]?.assistantTurnId);
  });

  it("keeps generating to a durable terminal when the starting connection disconnects mid-stream", async () => {
    const harness = createRouteHarness();

    // startRun reads only the started frame and cancels the body — the dropped
    // subscriber must not interrupt the server-owned generation fiber.
    const started = await startRun(harness.app, runRequest());

    await vi.waitFor(() => {
      const turn = harness.repositories
        .snapshot()
        .assistantTurns.find((candidate) => candidate.assistantTurnId === started.assistantTurnId);
      expect(turn?.status).toBe("completed");
    });

    const messages = harness.repositories
      .snapshot()
      .messages.filter((message) => message.conversationId === started.conversationId);
    expect(messages.some((message) => message.role === "assistant")).toBe(true);
  });

  it("returns a generic 500 body without leaking the underlying error message", async () => {
    const repositories = createMemorySidechatRepositories();
    // A repository that throws a driver-shaped message at pre-start.
    const leaky: MemorySidechatRepositories = {
      ...repositories,
      appendMessage: () =>
        Promise.reject(new Error("SECRET DRIVER DETAIL: relation messages does not exist")),
    };
    const app = createPartnerAiServiceApp({
      repositories: leaky,
      agentRuntime: completedRuntime(),
    });

    const response = await postRun(app, runRequest({ requestId: "request_leak_001" }));

    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["code"]).toBe("internal_error");
    // The body names the request id for support, never the driver detail.
    expect(String(body["message"])).toContain("request_leak_001");
    expect(String(body["message"])).not.toContain("SECRET DRIVER DETAIL");
  });

  it("rejects a malformed body as a JSON bad-request without opening a run", async () => {
    const harness = createRouteHarness();

    const response = await harness.app.request("/chat/runs", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: "{ not json",
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
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
