import type { UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";

import { BEGIN_TURN_DISPOSITIONS, type TurnStore } from "#application/ports/turn/turn-store";
import { TURN_TERMINAL_STATUSES, type TurnRef } from "#domain/turn/turn";

import { finalizeTurn } from "./finalize-turn.js";

const TURN: TurnRef = {
  conversationId: "conversation-1",
  turnId: "turn-1",
  workspaceId: "workspace-1",
  subjectId: "subject-1",
};

const ASSISTANT_MESSAGE: UIMessage = {
  id: "assistant-1",
  role: "assistant",
  parts: [{ type: "text", text: "Complete answer" }],
};

describe("finalizeTurn", () => {
  it("hands terminal state and visible output to one aggregate persistence operation", async () => {
    const finalize = vi.fn<TurnStore["finalize"]>().mockResolvedValue(true);
    const release = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const claimed = await finalizeTurn(
      { turns: turnStore({ finalize }) },
      {
        turn: TURN,
        status: TURN_TERMINAL_STATUSES.COMPLETED,
        stepUsage: [
          { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
          { inputTokens: 4, outputTokens: 6, totalTokens: 10, reasoningTokens: 1 },
        ],
        assistantMessage: ASSISTANT_MESSAGE,
        finishReason: "stop",
        admission: { release },
      },
    );

    expect(claimed).toBe(true);
    expect(finalize).toHaveBeenCalledOnce();
    expect(finalize).toHaveBeenCalledWith(TURN, {
      terminal: {
        status: "completed",
        usage: {
          inputTokens: 6,
          outputTokens: 9,
          totalTokens: 15,
          reasoningTokens: 1,
          cachedInputTokens: 0,
        },
        finishReason: "stop",
      },
      assistantMessage: ASSISTANT_MESSAGE,
    });
    expect(release).toHaveBeenCalledOnce();
  });
});

function turnStore(overrides: Partial<TurnStore>): TurnStore {
  return {
    assertCanBegin: () => Promise.resolve(BEGIN_TURN_DISPOSITIONS.CREATED),
    beginTurn: () => Promise.resolve({ ...TURN, disposition: BEGIN_TURN_DISPOSITIONS.CREATED }),
    bindRun: () => Promise.resolve(),
    assertRunOwned: () => Promise.resolve(),
    finalize: () => Promise.resolve(false),
    ...overrides,
  };
}
