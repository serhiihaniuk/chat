import { describe, expect, it } from "vitest";

import { DeterministicTurnExecution } from "#testing/turn/deterministic-turn-execution";
import { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import type { TurnExecution } from "#application/ports/turn/turn-execution";
import type { TurnStore } from "#application/ports/turn/turn-store";
import { TURN_MESSAGE_ROLES } from "#domain/turn/turn";

import { cancelTurn } from "./cancel-turn.js";

describe("cancelTurn", () => {
  it("proves ownership before cancelling execution", async () => {
    const calls: string[] = [];
    const execution = new DeterministicTurnExecution();
    const state = await stateWithBoundRun();
    const turns: TurnStore = {
      assertCanBegin: (auth, conversationId) => state.assertCanBegin(auth, conversationId),
      beginTurn: (beginInput) => state.beginTurn(beginInput),
      bindRun: (turn, runId) => state.bindRun(turn, runId),
      assertRunOwned: async (...parameters: Parameters<typeof state.assertRunOwned>) => {
        calls.push("ownership");
        return state.assertRunOwned(...parameters);
      },
      claimTerminal: (turn, terminal) => state.claimTerminal(turn, terminal),
    };
    const tracedExecution: TurnExecution = {
      start: (turnInput) => execution.start(turnInput),
      cancel: (runId) => {
        calls.push("cancel");
        return execution.cancel(runId);
      },
    };

    await cancelTurn(turns, tracedExecution, input());
    expect(calls).toEqual(["ownership", "cancel"]);
  });

  it("rejects a run that is not bound to the owned conversation", async () => {
    const state = await stateWithBoundRun();
    const execution = new DeterministicTurnExecution();

    await expect(
      cancelTurn(state, execution, { ...input(), runId: "foreign-run" }),
    ).rejects.toMatchObject({ code: "turn_run_not_found" });
    expect(execution.cancelled).toEqual([]);
  });

  it("does not cancel when ownership fails", async () => {
    const state = new InMemoryTurnState([]);
    const execution = new DeterministicTurnExecution();

    await expect(cancelTurn(state, execution, input())).rejects.toMatchObject({
      code: "conversation_not_found",
    });
    expect(execution.cancelled).toEqual([]);
  });
});

async function stateWithBoundRun(): Promise<InMemoryTurnState> {
  const state = new InMemoryTurnState([
    { conversationId: "conversation-1", workspaceId: "workspace-1", subjectId: "subject-1" },
  ]);
  const turn = await state.beginTurn({
    auth: input().auth,
    conversationId: input().conversationId,
    requestId: "request-1",
    userMessage: { id: "user-1", role: TURN_MESSAGE_ROLES.USER, text: "Hello" },
  });
  await state.bindRun(turn, input().runId);
  return state;
}

function input() {
  return {
    auth: {
      workspaceId: "workspace-1",
      subjectId: "subject-1",
      issuedAt: "now",
    },
    conversationId: "conversation-1",
    runId: "run-1",
  } as const;
}
