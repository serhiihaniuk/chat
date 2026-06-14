import type { JsonObject } from "@side-chat/chat-protocol";

export const WORKFLOW_RUN_STATUSES = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[keyof typeof WORKFLOW_RUN_STATUSES];

export const WORKFLOW_NODE_STATUSES = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
  CANCELLED: "cancelled",
} as const;

export type WorkflowNodeStatus =
  (typeof WORKFLOW_NODE_STATUSES)[keyof typeof WORKFLOW_NODE_STATUSES];

export type WorkflowArtifact = {
  readonly artifactId: string;
  readonly workflowRunId: string;
  readonly nodeId: string;
  readonly artifactKind: string;
  readonly contentType: string;
  readonly payload: JsonObject;
  readonly createdAt: string;
};

export type WorkflowRun = {
  readonly workflowRunId: string;
  readonly workflowId: string;
  readonly conversationId: string;
  readonly status: WorkflowRunStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly cancelledAt?: string;
  readonly failedAt?: string;
};

export type WorkflowNode = {
  readonly workflowRunId: string;
  readonly nodeId: string;
  readonly profileId: string;
  readonly status: WorkflowNodeStatus;
  readonly parentNodeIds: readonly string[];
  readonly contextManifestId?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly failedAt?: string;
};
