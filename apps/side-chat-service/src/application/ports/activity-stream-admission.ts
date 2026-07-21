import type { AuthContext } from "@side-chat/side-chat-server";

export const ACTIVITY_STREAM_REJECTION_REASONS = {
  PROCESS_CAPACITY: "process_capacity",
  SUBJECT_CAPACITY: "subject_capacity",
} as const;

export type ActivityStreamRejectionReason =
  (typeof ACTIVITY_STREAM_REJECTION_REASONS)[keyof typeof ACTIVITY_STREAM_REJECTION_REASONS];

export type ActivityStreamLease = Readonly<{
  release: () => void;
}>;

export type ActivityStreamAdmissionResult =
  | Readonly<{ accepted: true; lease: ActivityStreamLease }>
  | Readonly<{ accepted: false; reason: ActivityStreamRejectionReason }>;

/** Outer-adapter seam for reserving one authenticated activity subscription. */
export interface ActivityStreamAdmission {
  tryAcquire(auth: Pick<AuthContext, "workspaceId" | "subjectId">): ActivityStreamAdmissionResult;
}
