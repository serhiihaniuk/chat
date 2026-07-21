import type { FinishReason } from "ai";

import type {
  WorkflowActiveTurn,
  WorkflowChatHttpError,
  WorkflowUIMessage,
} from "#entities/workflow-chat";
import type { WorkflowApprovalDecisions } from "../../../approval/workflow-approval.js";

export const WORKFLOW_CHAT_EVENT = {
  APPROVAL_DECISION_RECORDED: "ApprovalDecisionRecorded",
  APPROVAL_REQUEST_STARTED: "ApprovalRequestStarted",
  ATTACHMENT_STARTED: "AttachmentStarted",
  CANCEL_DELIVERY_FAILED: "CancelDeliveryFailed",
  CANCEL_DELIVERY_STARTED: "CancelDeliveryStarted",
  CANCEL_REQUESTED: "CancelRequested",
  CLIENT_TOOL_CLAIMED: "ClientToolClaimed",
  CLIENT_TOOL_SETTLED: "ClientToolSettled",
  EPOCH_DISPOSED: "EpochDisposed",
  OPTIMISTIC_MESSAGE_ADDED: "OptimisticMessageAdded",
  PART_RECEIVED: "PartReceived",
  RETRY_STARTED: "RetryStarted",
  RUN_ACCEPTED: "RunAccepted",
  SNAPSHOT_LOADED: "SnapshotLoaded",
  STREAM_ENDED: "StreamEnded",
  TRANSPORT_DROPPED: "TransportDropped",
  TRANSPORT_RECONNECTING: "TransportReconnecting",
  TRANSPORT_RECOVERED: "TransportRecovered",
} as const;

/** Reducer inputs accepted by one workflow conversation aggregate. */
export type WorkflowWidgetChatEvent =
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.SNAPSHOT_LOADED;
      activeTurn: WorkflowActiveTurn | undefined;
      messages: readonly WorkflowUIMessage[];
      observationId: string | undefined;
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.OPTIMISTIC_MESSAGE_ADDED;
      message: WorkflowUIMessage;
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.ATTACHMENT_STARTED;
      epochId: string;
      reconnecting: boolean;
      runId: string | undefined;
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.RUN_ACCEPTED;
      epochId: string;
      runId: string;
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.PART_RECEIVED;
      epochId: string;
      message: WorkflowUIMessage;
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.STREAM_ENDED;
      epochId: string;
      finishReason: FinishReason | undefined;
      serverAborted: boolean;
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.TRANSPORT_DROPPED;
      epochId: string;
      error: WorkflowChatHttpError;
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.TRANSPORT_RECONNECTING;
      epochId: string;
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.TRANSPORT_RECOVERED;
      epochId: string;
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.CANCEL_REQUESTED;
      runId: string | undefined;
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.CANCEL_DELIVERY_STARTED;
      runId: string;
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.CANCEL_DELIVERY_FAILED;
      runId: string;
      error: WorkflowChatHttpError;
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.EPOCH_DISPOSED;
      epochId: string;
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.RETRY_STARTED;
      messages: readonly WorkflowUIMessage[];
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.CLIENT_TOOL_CLAIMED;
      toolCallId: string;
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.CLIENT_TOOL_SETTLED;
      toolCallId: string;
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.APPROVAL_REQUEST_STARTED;
      approvalId: string;
      decision: "approved" | "denied";
    }>
  | Readonly<{
      type: typeof WORKFLOW_CHAT_EVENT.APPROVAL_DECISION_RECORDED;
      approvalId: string;
      decision: WorkflowApprovalDecisions[string];
    }>;

export type WorkflowWidgetSessionControlEvent = Extract<
  WorkflowWidgetChatEvent,
  {
    type:
      | typeof WORKFLOW_CHAT_EVENT.EPOCH_DISPOSED
      | typeof WORKFLOW_CHAT_EVENT.RETRY_STARTED
      | typeof WORKFLOW_CHAT_EVENT.CLIENT_TOOL_CLAIMED
      | typeof WORKFLOW_CHAT_EVENT.CLIENT_TOOL_SETTLED
      | typeof WORKFLOW_CHAT_EVENT.APPROVAL_REQUEST_STARTED
      | typeof WORKFLOW_CHAT_EVENT.APPROVAL_DECISION_RECORDED;
  }
>;

export type WorkflowWidgetCancellationEvent = Extract<
  WorkflowWidgetChatEvent,
  {
    type:
      | typeof WORKFLOW_CHAT_EVENT.CANCEL_REQUESTED
      | typeof WORKFLOW_CHAT_EVENT.CANCEL_DELIVERY_STARTED
      | typeof WORKFLOW_CHAT_EVENT.CANCEL_DELIVERY_FAILED;
  }
>;
