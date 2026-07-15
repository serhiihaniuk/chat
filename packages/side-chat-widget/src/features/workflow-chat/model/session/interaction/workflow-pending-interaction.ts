import { isRecord } from "@side-chat/shared";

import type { WorkflowUIMessage } from "#entities/workflow-chat";

const PENDING_INTERACTION_STATES = new Set([
  "approval-requested",
  "input-available",
  "input-streaming",
]);

/** A paused interaction keeps the durable run open even though its stream ended. */
export function hasPendingWorkflowInteraction(message: WorkflowUIMessage): boolean {
  return message.parts.some(hasPendingInteractionState);
}

function hasPendingInteractionState(part: unknown): boolean {
  const state = readInteractionState(part);
  return state !== undefined && PENDING_INTERACTION_STATES.has(state);
}

function readInteractionState(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const state = value["state"];
  return typeof state === "string" ? state : undefined;
}
