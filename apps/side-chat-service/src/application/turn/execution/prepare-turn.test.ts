import { describe, expect, it, vi } from "vitest";

import { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import { BEGIN_TURN_DISPOSITIONS, type TurnStore } from "#application/ports/turn/turn-store";
import type { TurnAdmission } from "#application/ports/turn/turn-admission";
import type { TurnExecution, TurnExecutionTerminal } from "#application/ports/turn/turn-execution";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { TurnModelPolicy } from "#application/turn/turn-model-policy";
import { DeterministicTurnAdmission } from "#testing/turn/deterministic-turn-admission";
import { DeterministicTurnExecution } from "#testing/turn/deterministic-turn-execution";
import type { HostContext } from "#domain/host-context";
import {
  TURN_EXECUTION_ERROR_CODES,
  TURN_MESSAGE_ROLES,
  TURN_TERMINAL_STATUSES,
  type TurnMessage,
} from "#domain/turn/turn";

import { prepareTurn } from "./prepare-turn.js";

const auth = {
  workspaceId: "workspace-1",
  subjectId: "subject-1",
  issuedAt: "now",
};
const userMessage: TurnMessage = {
  id: "user-1",
  role: TURN_MESSAGE_ROLES.USER,
  text: "Hello",
};
const hostContext: HostContext = {
  schemaVersion: "host.v1",
  origin: "https://admin.example.test",
  url: "https://admin.example.test/deployments/7",
  title: "Deployment 7",
  metadata: { deploymentId: 7 },
};

describe("prepareTurn", () => {
  it("performs admission and persistence before starting execution", async () => {
    const calls: string[] = [];
    const state = createState();
    const admission = new DeterministicTurnAdmission();
    const execution = new DeterministicTurnExecution();
    const prepared = await prepareTurn(
      {
        modelPolicy: traceModelPolicy(calls),
        admission: traceAdmission(admission, calls),
        turns: traceTurnStore(state, calls),
        execution: traceExecution(execution, calls),
      },
      input(),
    );

    expect(calls).toEqual([
      "model-policy",
      "preflight",
      "admission",
      "begin-turn",
      "execution",
      "bind-run",
    ]);
    expect(prepared.execution.runId).toBe("run-turn-1");
    expect(admission.released).toBe(0);
  });

  it("rejects a busy conversation without persisting another message", async () => {
    const state = createState();
    state.runningTurns.add("conversation-1");
    const admission = new DeterministicTurnAdmission();

    await expect(
      prepareTurn(
        {
          modelPolicy: selectTestModel,
          admission,
          turns: state,
          execution: new DeterministicTurnExecution(),
        },
        input(),
      ),
    ).rejects.toMatchObject({ code: "conversation_busy" });
    expect(admission.admitted).toBe(0);
    expect(admission.released).toBe(0);
    expect(state.userMessages).toEqual([]);
    expect(state.terminals.size).toBe(0);
  });

  it("rejects model policy before preflight, admission, persistence, or execution", async () => {
    const calls: string[] = [];
    const state = createState();
    const admission = new DeterministicTurnAdmission();
    const execution = new DeterministicTurnExecution();

    await expect(
      prepareTurn(
        {
          modelPolicy: () => {
            calls.push("model-policy");
            throw new TurnRejectedError(
              TURN_REJECTION_CODES.MODEL_NOT_ALLOWED,
              "Model is not available",
            );
          },
          admission: traceAdmission(admission, calls),
          turns: traceTurnStore(state, calls),
          execution: traceExecution(execution, calls),
        },
        input({ requestedModelId: "unknown-model" }),
      ),
    ).rejects.toMatchObject({ code: TURN_REJECTION_CODES.MODEL_NOT_ALLOWED });
    expect(calls).toEqual(["model-policy"]);
    expect(admission.admitted).toBe(0);
    expect(state.userMessages).toEqual([]);
    expect(execution.started).toEqual([]);
  });

  it("keeps the accepted message exact while context changes only its execution copy", async () => {
    const state = createState();
    const execution = new DeterministicTurnExecution();
    const earlierUser: TurnMessage = {
      id: "user-0",
      role: TURN_MESSAGE_ROLES.USER,
      text: "Earlier question",
    };
    const earlierAssistant: TurnMessage = {
      id: "assistant-0",
      role: TURN_MESSAGE_ROLES.ASSISTANT,
      text: "Earlier answer",
    };

    await prepareTurn(
      {
        modelPolicy: selectTestModel,
        admission: new DeterministicTurnAdmission(),
        turns: state,
        execution,
      },
      {
        ...input(),
        messages: [earlierUser, earlierAssistant, userMessage],
        hostContext,
      },
    );

    expect(state.userMessages).toEqual([userMessage]);
    expect(execution.started[0]?.messages.slice(0, -1)).toEqual([earlierUser, earlierAssistant]);
    expect(execution.started[0]?.messages.at(-1)).toMatchObject({
      id: userMessage.id,
      role: TURN_MESSAGE_ROLES.USER,
    });
    expect(execution.started[0]?.messages.at(-1)?.text).toContain("Deployment 7");
    expect(execution.started[0]?.messages.at(-1)?.text).toContain(userMessage.text);
    expect(execution.started[0]?.messages.at(-1)?.text).not.toBe(userMessage.text);
  });

  it("releases admission when execution cannot start", async () => {
    const state = createState();
    const admission = new DeterministicTurnAdmission();

    await expect(
      prepareTurn(
        {
          modelPolicy: selectTestModel,
          admission,
          turns: state,
          execution: new DeterministicTurnExecution(new Error("start failed")),
        },
        input(),
      ),
    ).rejects.toThrow("start failed");
    expect(admission.released).toBe(1);
    expect(state.userMessages).toEqual([userMessage]);
    expect(state.runningTurns.size).toBe(0);
    expect(state.terminals.get("turn-1")).toMatchObject({
      status: TURN_TERMINAL_STATUSES.FAILED,
      safeErrorCode: TURN_EXECUTION_ERROR_CODES.WORKFLOW_FAILED,
    });
  });

  it("holds admission to terminal when binding an already-started run fails", async () => {
    const state = createState();
    const admission = new DeterministicTurnAdmission();
    const terminal = Promise.withResolvers<TurnExecutionTerminal>();
    const cancel = vi.fn<(runId: string) => Promise<void>>().mockResolvedValue(undefined);
    const execution: TurnExecution = {
      start: () =>
        Promise.resolve({
          runId: "run-started",
          stream: new ReadableStream({ start: (controller) => controller.close() }),
          terminal: terminal.promise,
        }),
      resume: () => Promise.reject(new Error("resume not expected")),
      cancel,
    };
    const turns: TurnStore = {
      assertCanBegin: (owner, conversationId, requestId) =>
        state.assertCanBegin(owner, conversationId, requestId),
      beginTurn: (beginInput) => state.beginTurn(beginInput),
      bindRun: () => Promise.reject(new Error("bind failed")),
      assertRunOwned: (owner, conversationId, runId) =>
        state.assertRunOwned(owner, conversationId, runId),
      finalize: (turn, record) => state.finalize(turn, record),
    };

    await expect(
      prepareTurn({ modelPolicy: selectTestModel, admission, turns, execution }, input()),
    ).rejects.toThrow("bind failed");
    expect(cancel).toHaveBeenCalledWith("run-started");
    expect(admission.released).toBe(0);

    terminal.resolve({ status: TURN_TERMINAL_STATUSES.CANCELLED, stepUsage: [] });
    await terminal.promise;
    await Promise.resolve();

    expect(admission.released).toBe(1);
  });

  it("releases admission when an atomic begin loses the idle race", async () => {
    const state = createState();
    const admission = new DeterministicTurnAdmission();
    const turns: TurnStore = {
      assertCanBegin: () => Promise.resolve(BEGIN_TURN_DISPOSITIONS.CREATED),
      beginTurn: () =>
        Promise.reject(
          new TurnRejectedError(TURN_REJECTION_CODES.BUSY, "Conversation became busy"),
        ),
      bindRun: (turn, runId) => state.bindRun(turn, runId),
      assertRunOwned: (authContext, conversationId, runId) =>
        state.assertRunOwned(authContext, conversationId, runId),
      finalize: (turn, record) => state.finalize(turn, record),
    };

    await expect(
      prepareTurn(
        {
          modelPolicy: selectTestModel,
          admission,
          turns,
          execution: new DeterministicTurnExecution(),
        },
        input(),
      ),
    ).rejects.toMatchObject({ code: TURN_REJECTION_CODES.BUSY });
    expect(admission.admitted).toBe(1);
    expect(admission.released).toBe(1);
    expect(state.userMessages).toEqual([]);
  });

  it("re-attaches an exact request replay without starting or binding another run", async () => {
    const state = createState();
    const execution = new DeterministicTurnExecution();
    const replayAdmission = new DeterministicTurnAdmission();

    const first = await prepareTurn(
      {
        modelPolicy: selectTestModel,
        admission: new DeterministicTurnAdmission(),
        turns: state,
        execution,
      },
      input(),
    );
    const replay = await prepareTurn(
      {
        modelPolicy: selectTestModel,
        admission: replayAdmission,
        turns: state,
        execution,
      },
      input(),
    );

    expect(execution.started).toHaveLength(1);
    expect(execution.resumed).toHaveLength(1);
    expect(execution.resumed[0]?.runId).toBe(first.execution.runId);
    expect(replay.turn).toEqual(first.turn);
    expect(state.userMessages).toEqual([userMessage]);
    expect(replayAdmission.admitted).toBe(0);
  });

  it("releases a reservation when atomic begin discovers a replay after preflight", async () => {
    const state = createState();
    const existing = await state.beginTurn({
      auth,
      conversationId: input().conversationId,
      requestId: input().requestId,
      userMessage,
    });
    await state.bindRun(existing, "run-existing");
    const admission = new DeterministicTurnAdmission();
    const turns: TurnStore = {
      assertCanBegin: () => Promise.resolve(BEGIN_TURN_DISPOSITIONS.CREATED),
      beginTurn: (beginInput) => state.beginTurn(beginInput),
      bindRun: (turn, runId) => state.bindRun(turn, runId),
      assertRunOwned: (owner, conversationId, runId) =>
        state.assertRunOwned(owner, conversationId, runId),
      finalize: (turn, record) => state.finalize(turn, record),
    };

    const prepared = await prepareTurn(
      {
        modelPolicy: selectTestModel,
        admission,
        turns,
        execution: new DeterministicTurnExecution(),
      },
      input(),
    );

    expect(prepared.execution.runId).toBe("run-existing");
    expect(admission.admitted).toBe(1);
    expect(admission.released).toBe(1);
    await prepared.admission.release();
    expect(admission.released).toBe(1);
  });

  it("fails closed while an accepted replay is still waiting for its run binding", async () => {
    const state = createState();
    const admission = new DeterministicTurnAdmission();
    const execution = new DeterministicTurnExecution();
    await state.beginTurn({
      auth,
      conversationId: input().conversationId,
      requestId: input().requestId,
      userMessage,
    });

    await expect(
      prepareTurn({ modelPolicy: selectTestModel, admission, turns: state, execution }, input()),
    ).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.RUN_NOT_READY,
      retryAfterSeconds: 1,
    });
    expect(execution.started).toEqual([]);
    expect(execution.resumed).toEqual([]);
    expect(state.runningTurns.has(input().conversationId)).toBe(true);
    expect(state.terminals.size).toBe(0);
    expect(admission.admitted).toBe(0);
    expect(admission.released).toBe(0);
  });

  it("rejects request-id reuse with a different accepted message", async () => {
    const state = createState();
    const admission = new DeterministicTurnAdmission();
    await state.beginTurn({
      auth,
      conversationId: input().conversationId,
      requestId: input().requestId,
      userMessage,
    });
    const differentMessage = { ...userMessage, text: "Different message" };

    await expect(
      prepareTurn(
        {
          modelPolicy: selectTestModel,
          admission,
          turns: state,
          execution: new DeterministicTurnExecution(),
        },
        { ...input(), messages: [differentMessage], acceptedUserMessage: differentMessage },
      ),
    ).rejects.toMatchObject({ code: TURN_REJECTION_CODES.REQUEST_CONFLICT });
    expect(state.userMessages).toEqual([userMessage]);
    expect(admission.admitted).toBe(0);
    expect(admission.released).toBe(0);
  });
});

function createState(): InMemoryTurnState {
  return new InMemoryTurnState([
    {
      conversationId: "conversation-1",
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
    },
  ]);
}

function input(overrides: { requestedModelId?: string } = {}) {
  return {
    auth,
    conversationId: "conversation-1",
    requestId: "request-1",
    requestedModelId: overrides.requestedModelId ?? "test-model",
    messages: [userMessage],
    acceptedUserMessage: userMessage,
  } as const;
}

const selectTestModel: TurnModelPolicy = (requestedModelId, requestedReasoningEffort) => ({
  modelId: requestedModelId ?? "test-model",
  ...(requestedReasoningEffort === undefined ? {} : { reasoningEffort: requestedReasoningEffort }),
});

function traceModelPolicy(calls: string[]): TurnModelPolicy {
  return (requestedModelId, requestedReasoningEffort) => {
    calls.push("model-policy");
    return selectTestModel(requestedModelId, requestedReasoningEffort);
  };
}

function traceAdmission(admission: TurnAdmission, calls: string[]): TurnAdmission {
  return {
    admitTurn: (conversationId) => {
      calls.push("admission");
      return admission.admitTurn(conversationId);
    },
  };
}

function traceTurnStore(turns: TurnStore, calls: string[]): TurnStore {
  return {
    assertCanBegin: (authContext, conversationId, requestId) => {
      calls.push("preflight");
      return turns.assertCanBegin(authContext, conversationId, requestId);
    },
    beginTurn: (beginInput) => {
      calls.push("begin-turn");
      return turns.beginTurn(beginInput);
    },
    bindRun: (turn, runId) => {
      calls.push("bind-run");
      return turns.bindRun(turn, runId);
    },
    assertRunOwned: (authContext, conversationId, runId) =>
      turns.assertRunOwned(authContext, conversationId, runId),
    finalize: (turn, record) => turns.finalize(turn, record),
  };
}

function traceExecution(execution: TurnExecution, calls: string[]): TurnExecution {
  return {
    start: (turnInput) => {
      calls.push("execution");
      return execution.start(turnInput);
    },
    resume: (runId, turnInput) => execution.resume(runId, turnInput),
    cancel: (runId) => execution.cancel(runId),
  };
}
