import {
  createWorkflowStepStore,
  withWorkflowStepStore,
} from "#composition/workflow/workflow-step-store";
import type { TurnRef } from "#domain/turn/turn";

import type { ChatTurnFinalization } from "../outcome/chat-turn-outcome.js";

type ChatTurnFinalizeInput = Readonly<{
  databaseUrl: string;
  identity: TurnRef;
  finalization: ChatTurnFinalization;
}>;

/**
 * Convert the workflow's terminal projection into one guarded Postgres write.
 * The source is the closed journal plus terminal outcome; the target is the
 * product turn, optional assistant message, conversation activity, and
 * notification. The transaction preserves the invariant that history and the
 * terminal state become visible together, while a replay after commit is a no-op.
 */
export async function runChatTurnFinalizeStep(input: ChatTurnFinalizeInput): Promise<void> {
  "use step";

  await withWorkflowStepStore(input.databaseUrl, createWorkflowStepStore, (store) =>
    store.finalize(input.identity, input.finalization),
  );
}
