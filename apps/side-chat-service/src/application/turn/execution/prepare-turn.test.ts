import { describe, expect, it } from "vitest";

import { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import type { TurnStore } from "#application/ports/turn/turn-store";
import type { TurnAdmission } from "#application/ports/turn/turn-admission";
import type { TurnExecution } from "#application/ports/turn/turn-execution";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { TurnModelPolicy } from "#application/turn/turn-model-policy";
import { DeterministicTurnAdmission } from "#testing/turn/deterministic-turn-admission";
import { DeterministicTurnExecution } from "#testing/turn/deterministic-turn-execution";
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

  it("releases admission when an atomic begin loses the idle race", async () => {
    const state = createState();
    const admission = new DeterministicTurnAdmission();
    const turns: TurnStore = {
      assertCanBegin: () => Promise.resolve(),
      beginTurn: () =>
        Promise.reject(
          new TurnRejectedError(TURN_REJECTION_CODES.BUSY, "Conversation became busy"),
        ),
      bindRun: (turn, runId) => state.bindRun(turn, runId),
      assertRunOwned: (authContext, conversationId, runId) =>
        state.assertRunOwned(authContext, conversationId, runId),
      claimTerminal: (turn, terminal) => state.claimTerminal(turn, terminal),
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
    assertCanBegin: (authContext, conversationId) => {
      calls.push("preflight");
      return turns.assertCanBegin(authContext, conversationId);
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
    claimTerminal: (turn, terminal) => turns.claimTerminal(turn, terminal),
  };
}

function traceExecution(execution: TurnExecution, calls: string[]): TurnExecution {
  return {
    start: (turnInput) => {
      calls.push("execution");
      return execution.start(turnInput);
    },
    cancel: (runId) => execution.cancel(runId),
  };
}
