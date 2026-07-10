import {
  RUNTIME_EVENT_TYPES,
  type AiRuntimePort,
  type AiRuntimeRequest,
  type RuntimeEvent,
} from "@side-chat/ai-runtime-contract";
import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  type ChatStreamRequest,
} from "@side-chat/chat-protocol";
import { createMemorySidechatRepositories, type MemorySidechatRepositories } from "@side-chat/db";
import type { WorkspaceRef } from "@side-chat/partner-ai-core";
import { Stream } from "effect";
import { describe, expect, it } from "vitest";

import { createPartnerAiServiceApp, type PartnerAiServiceApp } from "../../../app.js";
import {
  TEST_SAFETY_POLL_INTERVAL_MS,
  readTurnStream,
  startRun,
} from "#testing/turn-stream/turn-stream-harness.test-support";

const AUTH_HEADER = { authorization: "Bearer local-test-token" } as const;

const runRequest = (overrides: Partial<ChatStreamRequest> = {}): ChatStreamRequest => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_cancel_001",
  message: { id: "message_cancel_001", content: "hello cancel" },
  ...overrides,
});

describe("POST /chat/turns/:assistantTurnId/cancel", () => {
  it("cancels a running turn: user_aborted, one aborted terminal, reconnecting subscriber ends", async () => {
    // A runtime that emits a delta then never terminates keeps the turn running
    // until the cancel interrupts it, so onExit owns the terminal.
    const harness = createApp({ agentRuntime: blockingRuntime() });
    const started = await startRun(harness.app, runRequest());

    const cancel = await harness.app.request(`/chat/turns/${started.assistantTurnId}/cancel`, {
      method: "POST",
      headers: AUTH_HEADER,
    });
    expect(cancel.status).toBe(200);
    await expect(cancel.json()).resolves.toMatchObject({
      assistantTurnId: started.assistantTurnId,
      cancelRequested: true,
    });

    await waitForStatus(harness.app, started.assistantTurnId, "user_aborted");

    // A subscriber that connects after the cancel replays the owner registry: it
    // sees exactly one aborted terminal and ends without hanging.
    const events = await readTurnStream(harness.app, started.assistantTurnId);
    const terminals = events.filter((event) => event.type === SIDECHAT_EVENT_TYPES.ERROR);
    expect(terminals).toHaveLength(1);
    expect(terminals[0]).toMatchObject({ code: PROTOCOL_ERROR_CODES.ABORTED });

    const turn = requireTurn(harness.repositories, started.assistantTurnId);
    expect(turn.status).toBe("user_aborted");
    expect(turn.errorCode).toBe(PROTOCOL_ERROR_CODES.ABORTED);
    expect(turn.cancelRequestedAt).toBeDefined();
  });

  it("is a no-op when cancelling an already-terminal turn", async () => {
    const harness = createApp({ agentRuntime: completedRuntime() });
    const started = await startRun(harness.app, runRequest());
    await waitForStatus(harness.app, started.assistantTurnId, "completed");

    const cancel = await harness.app.request(`/chat/turns/${started.assistantTurnId}/cancel`, {
      method: "POST",
      headers: AUTH_HEADER,
    });
    expect(cancel.status).toBe(200);
    await expect(cancel.json()).resolves.toMatchObject({ cancelRequested: false });

    // The completed turn is untouched: no cancel intent, still completed.
    const turn = requireTurn(harness.repositories, started.assistantTurnId);
    expect(turn.status).toBe("completed");
    expect(turn.cancelRequestedAt).toBeUndefined();
  });

  it("denies an unauthorized cancel with 401", async () => {
    const harness = createApp({ agentRuntime: blockingRuntime() });
    const started = await startRun(harness.app, runRequest());

    const cancel = await harness.app.request(`/chat/turns/${started.assistantTurnId}/cancel`, {
      method: "POST",
    });
    expect(cancel.status).toBe(401);

    // The turn is unaffected: no cancel intent was recorded.
    expect(
      requireTurn(harness.repositories, started.assistantTurnId).cancelRequestedAt,
    ).toBeUndefined();
  });

  it("does not let one workspace cancel another workspace's turn", async () => {
    // Two apps over one repository, scoped to different workspaces. The id is not
    // a bearer capability: workspace B cannot cancel workspace A's turn.
    const repositories = createMemorySidechatRepositories();
    const workspaceA = createWorkspaceApp(repositories, {
      tenantId: "tenant_a",
      workspaceId: "workspace_a",
    });
    const workspaceB = createWorkspaceApp(repositories, {
      tenantId: "tenant_b",
      workspaceId: "workspace_b",
    });

    const started = await startRun(workspaceA, runRequest({ requestId: "request_cancel_ws_a" }));

    const cancel = await workspaceB.request(`/chat/turns/${started.assistantTurnId}/cancel`, {
      method: "POST",
      headers: AUTH_HEADER,
    });
    // Cross-workspace id matches no running turn in B's scope: a no-op ack, and A's
    // turn keeps running with no cancel intent.
    expect(cancel.status).toBe(200);
    await expect(cancel.json()).resolves.toMatchObject({ cancelRequested: false });
    expect(requireTurn(repositories, started.assistantTurnId).cancelRequestedAt).toBeUndefined();
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

const createWorkspaceApp = (
  repositories: MemorySidechatRepositories,
  workspace: WorkspaceRef,
): PartnerAiServiceApp =>
  createPartnerAiServiceApp({
    repositories,
    workspace,
    resumability: { safetyPollIntervalMs: TEST_SAFETY_POLL_INTERVAL_MS },
    agentRuntime: blockingRuntime(),
  });

/** A runtime that emits a delta and then never terminates, keeping the turn running. */
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

/** A runtime that emits a deterministic activity, delta, and completion. */
const completedRuntime = (): AiRuntimePort => ({
  streamEffect: (request) => Stream.fromIterable(completedRuntimeEvents(request)),
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
  startedRuntimeEvent(request),
  {
    type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 1,
    content: "Recorded by the cancel test.",
  },
  {
    type: RUNTIME_EVENT_TYPES.COMPLETED,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 2,
    finishReason: "stop",
  },
];

const requireTurn = (repositories: MemorySidechatRepositories, assistantTurnId: string) => {
  const turn = repositories
    .snapshot()
    .assistantTurns.find((candidate) => candidate.assistantTurnId === assistantTurnId);
  if (!turn) throw new Error(`Assistant turn ${assistantTurnId} was not persisted.`);
  return turn;
};

const waitForStatus = async (
  app: PartnerAiServiceApp,
  assistantTurnId: string,
  status: string,
): Promise<void> => {
  await expect
    .poll(async () => {
      const response = await app.request(`/chat/turns/${assistantTurnId}`, {
        headers: AUTH_HEADER,
      });
      return ((await response.json()) as { status: string }).status;
    })
    .toBe(status);
};
