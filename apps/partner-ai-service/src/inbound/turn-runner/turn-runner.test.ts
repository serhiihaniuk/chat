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

import { composePartnerAiService } from "#composition/service-composition";
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

  it("finalizes a forced interruption as user_aborted with one synthetic aborted terminal", async () => {
    // A runtime that emits a delta then never terminates keeps the fiber alive
    // until it is interrupted, so onExit owns the terminal.
    const harness = createRunnerHarness({ runtime: blockingRuntime() });

    const started = await harness.runner.start({
      request: chatRequest(),
      authContext: AUTH_CONTEXT,
    });
    await harness.runner.interruptTurn(started.assistantTurnId);
    await harness.runner.awaitTurn(started.assistantTurnId);

    const events = await readTurnEvents(harness.repositories, started.assistantTurnId);
    const terminals = events.filter((event) => isTerminalEvent(eventOf(event)));
    expect(terminals).toHaveLength(1);
    const terminal = requireOnly(terminals);
    expect(terminal.type).toBe("error");
    expect(eventOf(terminal)).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.ERROR,
      code: PROTOCOL_ERROR_CODES.ABORTED,
      sequence: lastNonTerminalSequence(events) + 1,
    });

    const turn = requireTurn(harness.repositories, started.assistantTurnId);
    expect(turn.status).toBe("user_aborted");
    expect(turn.errorCode).toBe(PROTOCOL_ERROR_CODES.ABORTED);
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

  it("interrupts in-flight generation on shutdown and finalizes it as aborted", async () => {
    const harness = createRunnerHarness({ runtime: blockingRuntime() });

    const started = await harness.runner.start({
      request: chatRequest(),
      authContext: AUTH_CONTEXT,
    });
    await harness.runner.shutdown();
    await harness.runner.awaitTurn(started.assistantTurnId);

    // Closing the runner scope interrupted the fiber, so onExit still owned the
    // one terminal and the durable abort status.
    const events = await readTurnEvents(harness.repositories, started.assistantTurnId);
    expect(events.filter((event) => isTerminalEvent(eventOf(event)))).toHaveLength(1);
    expect(requireTurn(harness.repositories, started.assistantTurnId).status).toBe("user_aborted");
  });
});

type RunnerHarness = {
  readonly runner: TurnRunner;
  readonly repositories: MemorySidechatRepositories;
  readonly runtimeRequests: readonly AiRuntimeRequest[];
};

const createRunnerHarness = ({
  runtime,
}: { readonly runtime?: AiRuntimePort | undefined } = {}): RunnerHarness => {
  const repositories = createMemorySidechatRepositories();
  const runtimeRequests: AiRuntimeRequest[] = [];
  const composition = composePartnerAiService({
    workspace: WORKSPACE,
    repositories,
    agentRuntime: runtime ?? completedRuntime(runtimeRequests),
  });
  return { runner: composition.turnRunner, repositories, runtimeRequests };
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
