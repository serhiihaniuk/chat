import type { TurnClaimDisposition } from "#application/ports/turn/turn-store";
import {
  createWorkflowStepStore,
  withWorkflowStepStore,
} from "#composition/workflow/workflow-step-store";
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

  return withWorkflowStepStore(input.databaseUrl, createWorkflowStepStore, (store) =>
    store.claimRun(input.identity, input.runId),
  );
}
