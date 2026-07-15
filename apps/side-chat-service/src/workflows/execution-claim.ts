import {
  TURN_CLAIM_DISPOSITIONS,
  type TurnClaimDisposition,
} from "#application/ports/turn/turn-store";

import type { ChatTurnWorkflowInput } from "./input/chat-turn-input.js";
import { CHAT_TURN_OUTCOMES, type ChatTurnTerminalOutcome } from "./outcome/chat-turn-outcome.js";
import { runChatTurnClaimStep } from "./production/chat-turn-claim.js";

const FENCED_REASON = "product_turn_fenced";

export function claimChatTurnExecution(
  databaseUrl: string | undefined,
  input: ChatTurnWorkflowInput,
  runId: string,
): Promise<TurnClaimDisposition> {
  if (databaseUrl === undefined) return Promise.resolve(TURN_CLAIM_DISPOSITIONS.EXECUTE);
  return runChatTurnClaimStep({
    databaseUrl,
    runId,
    identity: {
      conversationId: input.conversationId,
      turnId: input.turnId,
      workspaceId: input.workspaceId,
      subjectId: input.subjectId,
    },
  });
}

export async function resolveRejectedChatTurnClaim(
  disposition: Exclude<TurnClaimDisposition, "execute">,
  databaseUrl: string | undefined,
  input: ChatTurnWorkflowInput,
  finalize: (
    databaseUrl: string,
    input: ChatTurnWorkflowInput,
    outcome: ChatTurnTerminalOutcome,
  ) => Promise<void>,
): Promise<ChatTurnTerminalOutcome> {
  const outcome: ChatTurnTerminalOutcome = {
    status: CHAT_TURN_OUTCOMES.CANCELLED,
    reason: FENCED_REASON,
  };
  if (disposition === TURN_CLAIM_DISPOSITIONS.CANCEL && databaseUrl !== undefined) {
    await finalize(databaseUrl, input, outcome);
  }
  return outcome;
}
