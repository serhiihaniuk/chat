import type { TurnExecution } from "#application/ports/turn/turn-execution";
import type { TurnStore } from "#application/ports/turn/turn-store";
import type { AuthContext } from "#domain/auth-context";

export type CancelTurnInput = Readonly<{
  auth: AuthContext;
  conversationId: string;
  runId: string;
}>;

export async function cancelTurn(
  turns: TurnStore,
  execution: TurnExecution,
  input: CancelTurnInput,
): Promise<void> {
  await turns.assertRunOwned(input.auth, input.conversationId, input.runId);
  await execution.cancel(input.runId);
}
