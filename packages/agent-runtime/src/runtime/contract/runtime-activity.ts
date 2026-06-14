import type { JsonObject } from "@side-chat/shared";

export const RUNTIME_ACTIVITY_KINDS = {
  PROGRESS: "progress",
  REASONING: "reasoning",
  TOOL: "tool",
} as const;

export type RuntimeActivityKind =
  (typeof RUNTIME_ACTIVITY_KINDS)[keyof typeof RUNTIME_ACTIVITY_KINDS];

export const RUNTIME_ACTIVITY_STATUSES = {
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type RuntimeActivityStatus =
  (typeof RUNTIME_ACTIVITY_STATUSES)[keyof typeof RUNTIME_ACTIVITY_STATUSES];

export type RuntimeActivitySource = {
  readonly label: string;
  readonly url?: string;
};

export type RuntimeActivityImage = {
  readonly alt: string;
  readonly caption?: string;
  readonly mediaType: string;
  readonly data: string;
};

export type RuntimeActivityToolDetails = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input?: JsonObject;
  readonly result?: JsonObject;
  readonly sources?: readonly RuntimeActivitySource[];
  readonly errorCode?: string;
};

export type RuntimeActivityDetails = {
  readonly sources?: readonly RuntimeActivitySource[];
  readonly images?: readonly RuntimeActivityImage[];
  readonly tool?: RuntimeActivityToolDetails;
};
