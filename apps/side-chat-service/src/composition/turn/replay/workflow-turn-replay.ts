import { TURN_REPLAY_RESULTS, type TurnReplay } from "#application/ports/turn/replay/turn-replay";
import {
  CHAT_TURN_OUTCOMES,
  chatTurnUsage,
  replayChatTurn,
  type ChatTurnTerminalOutcome,
  type ReplayedChatTurn,
} from "#workflows/production/chat-turn";
import type { TurnUsage } from "#domain/turn/turn";

import { stampFinishReason } from "../workflow-turn-execution.js";
import { normalizeClientToolReplay } from "./client-tool-replay-transform.js";

/** Adapt Workflow replay handles to the application replay port. */
export type ReplayChatTurn = (
  runId: string,
  startIndex: number,
  assistantMessageId: string,
) => Promise<ReplayedChatTurn>;

export function createWorkflowTurnReplay(replayTurn: ReplayChatTurn = replayChatTurn): TurnReplay {
  return {
    async open(runId, startIndex, assistantMessageId) {
      const replay = await replayTurn(runId, startIndex, assistantMessageId);
      if (replay.status !== TURN_REPLAY_RESULTS.FOUND) return replay;
      return {
        status: TURN_REPLAY_RESULTS.FOUND,
        stream: stampFinishReason(
          replay.stream.pipeThrough(normalizeClientToolReplay()),
          replay.terminal.then(replayFinishReason),
        ),
        tailIndex: replay.tailIndex,
      };
    },
  };
}

function replayFinishReason(terminal: ChatTurnTerminalOutcome): Readonly<{
  finishReason?: string;
  stepUsage?: readonly TurnUsage[];
  activityDurationMs?: number;
}> {
  if (terminal.status !== CHAT_TURN_OUTCOMES.COMPLETED) return {};
  return {
    finishReason: terminal.finishReason,
    stepUsage: [chatTurnUsage(terminal)],
    activityDurationMs: terminal.activityDurationMs,
  };
}
