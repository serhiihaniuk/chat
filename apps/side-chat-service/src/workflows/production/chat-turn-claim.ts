import type { TurnClaimDisposition } from "#application/ports/turn/turn-store";
import { createTurnExecutionClaimStore } from "#composition/workflow/turn-execution-store";
import type { TurnRef } from "#domain/turn/turn";

type ChatTurnClaimInput = Readonly<{
  databaseUrl: string;
  identity: TurnRef;
  runId: string;
}>;

/** Bind the real Workflow run and fence terminal or cancellation-requested turns. */
export async function runChatTurnClaimStep(
  input: ChatTurnClaimInput,
): Promise<TurnClaimDisposition> {
  "use step";

  const store = createTurnExecutionClaimStore(input.databaseUrl);
  try {
    return await store.claimRun(input.identity, input.runId);
  } finally {
    await store.close();
  }
}
