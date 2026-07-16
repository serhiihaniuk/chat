import type { WorkflowActiveTurn, WorkflowUIMessage } from "#entities/workflow-chat";
import type {
  WorkflowWidgetChatAttachmentMode,
  WorkflowWidgetChatEngine,
} from "../engine/workflow-widget-chat-engine.js";
import type {
  WorkflowWidgetChatSessionContext,
  WorkflowWidgetChatSessionSnapshot,
} from "../workflow-widget-chat-session-contract.js";

export type WorkflowWidgetChatRuntimeContext = Omit<
  WorkflowWidgetChatSessionContext,
  "initialMessages"
>;

export type WorkflowWidgetAttachmentEpoch = {
  readonly clientToolCapability: string | undefined;
  readonly engine: WorkflowWidgetChatEngine;
  readonly epochId: string;
  runId: string | undefined;
};

export function reconnectAttachment(
  runId: string,
  clientToolCapability: string | undefined,
): WorkflowWidgetChatAttachmentMode {
  return { clientToolCapability, kind: "reconnect", runId };
}

export function contextReconnectAttachment(
  runId: string,
  context: WorkflowWidgetChatRuntimeContext,
): WorkflowWidgetChatAttachmentMode {
  return reconnectAttachment(runId, context.clientToolCapability);
}

export function sendAttachment(
  messageId: string | undefined,
  trigger: "regenerate-message" | "submit-message",
  clientToolCapability: string,
): WorkflowWidgetChatAttachmentMode {
  return { clientToolCapability, kind: "send", messageId, trigger };
}

export function reconnectAttachmentFor(
  runId: string,
  requestedCapability: string | undefined,
  epoch: WorkflowWidgetAttachmentEpoch | undefined,
  context: WorkflowWidgetChatRuntimeContext,
): WorkflowWidgetChatAttachmentMode {
  const capability =
    requestedCapability ?? epoch?.clientToolCapability ?? context.clientToolCapability;
  return reconnectAttachment(runId, capability);
}

export function toWorkflowWidgetChatRuntimeContext(
  context: WorkflowWidgetChatSessionContext,
): WorkflowWidgetChatRuntimeContext {
  return {
    activeTurn: context.activeTurn,
    client: context.client,
    clientToolCapability: context.clientToolCapability,
    hostBridge: context.hostBridge,
    includeHostContext: context.includeHostContext,
    lifecycle: context.lifecycle,
    stateObservationId: context.stateObservationId,
  };
}

export function workflowWidgetChatSnapshotKey(
  messages: readonly WorkflowUIMessage[],
  activeTurn: WorkflowActiveTurn | undefined,
  observationId: string | undefined,
): string {
  if (observationId) return `observation:${observationId}`;
  const messageShape: string[] = [];
  for (const message of messages) {
    messageShape.push(
      `${message.id}:${String(message.parts.length)}:${message.metadata?.terminal?.status ?? ""}`,
    );
  }
  return `legacy:${activeTurn?.runId ?? "idle"}:${messageShape.join("|")}`;
}

export function hasPendingWorkflowInteraction(
  snapshot: WorkflowWidgetChatSessionSnapshot,
): boolean {
  return snapshot.pending.approvalIds.size > 0 || snapshot.pending.clientToolCallIds.size > 0;
}

export function findLastWorkflowAssistantIndex(messages: readonly WorkflowUIMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") return index;
  }
  return -1;
}
