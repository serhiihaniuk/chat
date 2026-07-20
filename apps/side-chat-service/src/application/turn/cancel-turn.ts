import type { TurnExecution } from "#application/ports/turn/turn-execution";
import {
  CANCEL_REQUEST_DISPOSITIONS,
  type TurnCancellationStore,
} from "#application/ports/turn/turn-store";
import type { AuthContext } from "@side-chat/side-chat-server";

export type CancelTurnInput = Readonly<{
  auth: AuthContext;
  conversationId: string;
  runId: string;
}>;

export async function cancelTurn(
  turns: TurnCancellationStore,
  execution: TurnExecution,
  input: CancelTurnInput,
): Promise<void> {
  const disposition = await turns.requestCancellation(
    input.auth,
    input.conversationId,
    input.runId,
  );
  if (disposition === CANCEL_REQUEST_DISPOSITIONS.DELIVER) {
    await execution.cancel(input.runId);
  }
}
