import type { FinishReason } from "ai";

import type {
  WorkflowActiveTurn,
  WorkflowChatHttpError,
  WorkflowUIMessage,
} from "#entities/workflow-chat";
import type { WorkflowApprovalDecisions } from "../../../approval/workflow-approval.js";

/** Reducer inputs accepted by one workflow conversation aggregate. */
export type WorkflowWidgetChatEvent =
  | Readonly<{
      type: "SnapshotLoaded";
      activeTurn: WorkflowActiveTurn | undefined;
      messages: readonly WorkflowUIMessage[];
      observationId: string | undefined;
    }>
  | Readonly<{ type: "OptimisticMessageAdded"; message: WorkflowUIMessage }>
  | Readonly<{
      type: "AttachmentStarted";
      epochId: string;
      reconnecting: boolean;
      runId: string | undefined;
    }>
  | Readonly<{ type: "RunAccepted"; epochId: string; runId: string }>
  | Readonly<{ type: "PartReceived"; epochId: string; message: WorkflowUIMessage }>
  | Readonly<{
      type: "StreamEnded";
      epochId: string;
      finishReason: FinishReason | undefined;
      serverAborted: boolean;
    }>
  | Readonly<{ type: "TransportDropped"; epochId: string; error: WorkflowChatHttpError }>
  | Readonly<{ type: "TransportReconnecting"; epochId: string }>
  | Readonly<{ type: "TransportRecovered"; epochId: string }>
  | Readonly<{ type: "CancelRequested"; runId: string | undefined }>
  | Readonly<{ type: "CancelDeliveryStarted"; runId: string }>
  | Readonly<{
      type: "CancelDeliveryFailed";
      runId: string;
      error: WorkflowChatHttpError;
    }>
  | Readonly<{ type: "EpochDisposed"; epochId: string }>
  | Readonly<{ type: "RetryStarted"; messages: readonly WorkflowUIMessage[] }>
  | Readonly<{ type: "ClientToolClaimed"; toolCallId: string }>
  | Readonly<{ type: "ClientToolSettled"; toolCallId: string }>
  | Readonly<{
      type: "ApprovalRequestStarted";
      approvalId: string;
      decision: "approved" | "denied";
    }>
  | Readonly<{
      type: "ApprovalDecisionRecorded";
      approvalId: string;
      decision: WorkflowApprovalDecisions[string];
    }>;
