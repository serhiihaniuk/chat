import type { UIMessageChunk } from "ai";

import { isWorkflowRecord } from "./workflow-value-guards.js";

export const TOOL_APPROVAL_DENIAL_OUTPUT_TYPE = "execution-denied";

export const TOOL_APPROVAL_DENIAL_REASONS = {
  CANCELLED: "tool_approval_cancelled",
  DENIED: "tool_approval_denied",
  EXPIRED: "tool_approval_expired",
  POLICY_CHANGED: "tool_approval_policy_changed",
  SCHEMA_CHANGED: "tool_approval_schema_changed",
  TOOL_CHANGED: "tool_approval_tool_changed",
} as const;

export type ToolApprovalDenialReason =
  (typeof TOOL_APPROVAL_DENIAL_REASONS)[keyof typeof TOOL_APPROVAL_DENIAL_REASONS];

export type ToolApprovalDenialOutput = Readonly<{
  type: typeof TOOL_APPROVAL_DENIAL_OUTPUT_TYPE;
  reason: ToolApprovalDenialReason;
}>;

export function deniedToolOutput(reason: ToolApprovalDenialReason): ToolApprovalDenialOutput {
  return { type: TOOL_APPROVAL_DENIAL_OUTPUT_TYPE, reason };
}

/** Keep the model-facing denial result while exposing the native denied UI state. */
export function normalizeApprovalUIChunk(chunk: UIMessageChunk): UIMessageChunk {
  if (chunk.type === "tool-output-available" && isDeniedToolOutput(chunk.output)) {
    return { type: "tool-output-denied", toolCallId: chunk.toolCallId };
  }
  return chunk;
}

export function isDeniedToolOutput(value: unknown): value is ToolApprovalDenialOutput {
  return isWorkflowRecord(value) && value["type"] === TOOL_APPROVAL_DENIAL_OUTPUT_TYPE;
}
