import type { UIMessageChunk } from "ai";
import { describe, expect, it, vi } from "vitest";

import { TURN_REPLAY_RESULTS } from "#application/ports/turn/replay/turn-replay";
import { CHAT_TURN_OUTCOMES } from "#workflows/production/chat-turn";

import { createWorkflowTurnReplay, type ReplayChatTurn } from "./workflow-turn-replay.js";

describe("createWorkflowTurnReplay", () => {
  it("opens a fresh cursor and stamps the durable terminal finish reason", async () => {
    const replayTurn = vi.fn<ReplayChatTurn>(() =>
      Promise.resolve({
        status: "found",
        tailIndex: 4,
        stream: chunks({ type: "start" }, { type: "finish" }),
        terminal: Promise.resolve({
          status: CHAT_TURN_OUTCOMES.COMPLETED,
          text: "done",
          finishReason: "length",
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        }),
      }),
    );

    const replay = await createWorkflowTurnReplay(replayTurn).open("run-1", -2);

    expect(replayTurn).toHaveBeenCalledWith("run-1", -2);
    expect(replay.status).toBe(TURN_REPLAY_RESULTS.FOUND);
    if (replay.status !== TURN_REPLAY_RESULTS.FOUND) return;
    expect(replay.tailIndex).toBe(4);
    expect(await readAll(replay.stream)).toEqual([
      { type: "start" },
      { type: "finish", finishReason: "length" },
    ]);
  });

  it.each(["not_found", "start_index_out_of_range"] as const)(
    "preserves the %s result without opening a stream",
    async (status) => {
      const replayTurn = vi.fn<ReplayChatTurn>(() =>
        Promise.resolve(status === "not_found" ? { status } : { status, tailIndex: 2 }),
      );
      await expect(createWorkflowTurnReplay(replayTurn).open("run-1", 9)).resolves.toEqual(
        status === "not_found" ? { status } : { status, tailIndex: 2 },
      );
    },
  );
});

function chunks(...parts: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const output: UIMessageChunk[] = [];
  for await (const chunk of stream) output.push(chunk);
  return output;
}
