import { asRecord } from "@side-chat/shared";

import type { WorkflowUIMessage } from "#entities/workflow-chat";
import type { WorkflowApprovalDecisions } from "../../approval/workflow-approval.js";

export type WorkflowWidgetPendingState = Readonly<{
  approvalIds: ReadonlySet<string>;
  approvalRequestsInFlight: ReadonlySet<string>;
  claimedClientToolCallIds: ReadonlySet<string>;
  clientToolCallIds: ReadonlySet<string>;
  handledClientToolCallIds: ReadonlySet<string>;
}>;

type PendingCollections = Readonly<{
  approvalIds: Set<string>;
  clientToolCallIds: Set<string>;
}>;

export function deriveWorkflowWidgetPendingState(
  messages: readonly WorkflowUIMessage[],
  decisions: WorkflowApprovalDecisions,
  handledClientToolCallIds: ReadonlySet<string>,
  previous: WorkflowWidgetPendingState = emptyWorkflowWidgetPendingState(),
): WorkflowWidgetPendingState {
  const approvalIds = new Set<string>();
  const clientToolCallIds = new Set<string>();
  for (const message of messages) {
    for (const part of message.parts) {
      collectPendingPart(part, decisions, handledClientToolCallIds, {
        approvalIds,
        clientToolCallIds,
      });
    }
  }
  return {
    approvalIds,
    approvalRequestsInFlight: retainPendingValues(previous.approvalRequestsInFlight, approvalIds),
    claimedClientToolCallIds: retainPendingValues(
      previous.claimedClientToolCallIds,
      clientToolCallIds,
    ),
    clientToolCallIds,
    handledClientToolCallIds,
  };
}

export function emptyWorkflowWidgetPendingState(): WorkflowWidgetPendingState {
  return {
    approvalIds: new Set(),
    approvalRequestsInFlight: new Set(),
    claimedClientToolCallIds: new Set(),
    clientToolCallIds: new Set(),
    handledClientToolCallIds: new Set(),
  };
}

export function addWorkflowWidgetPendingValue(
  values: ReadonlySet<string>,
  value: string,
): ReadonlySet<string> {
  const next = new Set(values);
  next.add(value);
  return next;
}

export function removeWorkflowWidgetPendingValue(
  values: ReadonlySet<string>,
  value: string,
): ReadonlySet<string> {
  if (!values.has(value)) return values;
  const next = new Set(values);
  next.delete(value);
  return next;
}

function collectPendingPart(
  part: WorkflowUIMessage["parts"][number],
  decisions: WorkflowApprovalDecisions,
  handledClientToolCallIds: ReadonlySet<string>,
  collections: PendingCollections,
): void {
  const record = asRecord(part);
  const toolCallId = stringField(record, "toolCallId");
  const state = stringField(record, "state");
  if (!toolCallId || !state) return;
  const approvalId = stringField(asRecord(record?.["approval"]), "id");
  if (state === "approval-requested" && approvalId && decisions[approvalId] === undefined) {
    collections.approvalIds.add(approvalId);
    return;
  }
  if (state !== "input-available" || record?.["providerExecuted"] === true) return;
  if (!handledClientToolCallIds.has(toolCallId)) {
    collections.clientToolCallIds.add(toolCallId);
  }
}

function stringField(
  record: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function retainPendingValues(
  values: ReadonlySet<string>,
  allowed: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set([...values].filter((value) => allowed.has(value)));
}
