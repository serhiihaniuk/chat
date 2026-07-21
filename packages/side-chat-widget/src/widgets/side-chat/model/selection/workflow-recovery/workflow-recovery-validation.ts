import type { WorkflowActiveTurn } from "#entities/workflow-chat";

import type { WorkflowActiveTurnCursor } from "./workflow-active-turn-cursor.js";

export type WorkflowRecoveryValidation = Readonly<{
  activeTurn: WorkflowActiveTurn | undefined;
  clientToolCapability: string | undefined;
  invalidCursor: WorkflowActiveTurnCursor | undefined;
  isPending: boolean;
}>;

/** Require the coherent service snapshot to confirm a tab cursor before reattaching its run. */
export function resolveWorkflowRecoveryValidation({
  activeConversationId,
  activeScopeKey,
  activeTurn,
  cursor,
  discoveryFailed,
  discoverySettled,
  needsValidation,
}: Readonly<{
  activeConversationId: string;
  activeScopeKey: string;
  activeTurn: WorkflowActiveTurn | null | undefined;
  cursor: WorkflowActiveTurnCursor | undefined;
  discoveryFailed: boolean;
  discoverySettled: boolean;
  needsValidation: boolean;
}>): WorkflowRecoveryValidation {
  const cursorCapability = capabilityForActiveTurn(cursor, activeTurn);
  if (
    !needsValidation ||
    cursor === undefined ||
    cursor.scopeKey !== activeScopeKey ||
    cursor.conversationId !== activeConversationId
  ) {
    return resolved(activeTurn ?? undefined, cursorCapability);
  }
  if (discoveryFailed) return resolved(undefined, undefined);
  if (!discoverySettled) return pending(undefined);
  if (activeTurn?.runId === cursor.runId) return resolved(activeTurn, cursor.clientToolCapability);
  return {
    activeTurn: activeTurn ?? undefined,
    clientToolCapability: undefined,
    invalidCursor: cursor,
    isPending: false,
  };
}

function capabilityForActiveTurn(
  cursor: WorkflowActiveTurnCursor | undefined,
  activeTurn: WorkflowActiveTurn | null | undefined,
): string | undefined {
  if (cursor?.runId !== activeTurn?.runId) return undefined;
  return cursor?.clientToolCapability;
}

function resolved(
  activeTurn: WorkflowActiveTurn | undefined,
  clientToolCapability: string | undefined,
): WorkflowRecoveryValidation {
  return { activeTurn, clientToolCapability, invalidCursor: undefined, isPending: false };
}

function pending(invalidCursor: WorkflowActiveTurnCursor | undefined): WorkflowRecoveryValidation {
  return {
    activeTurn: undefined,
    clientToolCapability: undefined,
    invalidCursor,
    isPending: true,
  };
}
