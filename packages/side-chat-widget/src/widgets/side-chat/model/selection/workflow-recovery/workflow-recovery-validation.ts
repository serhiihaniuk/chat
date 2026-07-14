import type { WorkflowActiveTurn } from "#entities/workflow-chat";

import type { WorkflowActiveTurnCursor } from "./workflow-active-turn-cursor.js";

export type WorkflowRecoveryValidation = Readonly<{
  activeTurn: WorkflowActiveTurn | undefined;
  invalidCursor: WorkflowActiveTurnCursor | undefined;
  isPending: boolean;
}>;

/** Require service discovery to confirm a tab cursor before reattaching its run. */
export function resolveWorkflowRecoveryValidation({
  activeConversationId,
  activeTurn,
  cursor,
  discoveryFailed,
  discoverySettled,
  needsValidation,
}: Readonly<{
  activeConversationId: string;
  activeTurn: WorkflowActiveTurn | null | undefined;
  cursor: WorkflowActiveTurnCursor | undefined;
  discoveryFailed: boolean;
  discoverySettled: boolean;
  needsValidation: boolean;
}>): WorkflowRecoveryValidation {
  if (!needsValidation || cursor?.conversationId !== activeConversationId) {
    return resolved(activeTurn ?? undefined);
  }
  if (discoveryFailed) return resolved(undefined);
  if (!discoverySettled) return pending(undefined);
  if (activeTurn?.runId === cursor.runId) return resolved(activeTurn);
  return pending(cursor);
}

function resolved(activeTurn: WorkflowActiveTurn | undefined): WorkflowRecoveryValidation {
  return { activeTurn, invalidCursor: undefined, isPending: false };
}

function pending(invalidCursor: WorkflowActiveTurnCursor | undefined): WorkflowRecoveryValidation {
  return { activeTurn: undefined, invalidCursor, isPending: true };
}
