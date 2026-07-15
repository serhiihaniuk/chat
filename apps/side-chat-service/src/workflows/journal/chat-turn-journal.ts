import { toUIMessageChunk, type ModelCallStreamPart } from "@ai-sdk/workflow";
import type { UIMessageChunk } from "ai";

/**
 * The workflow journal contains provider model parts plus records written by
 * WorkflowAgent itself. The DevKit currently types only the provider half of
 * that contract, so Side Chat names the complete durable shape at this edge.
 */
export const CHAT_TURN_JOURNAL_PART_TYPES = {
  APPROVAL_REQUEST: "tool-approval-request",
  PROVIDER_ERROR: "error",
  FINISH_STEP: "finish-step",
  START_STEP: "start-step",
  TOOL_OUTPUT_DENIED: "tool-output-denied",
} as const;

export type ApprovalRequestJournalPart = Readonly<{
  type: typeof CHAT_TURN_JOURNAL_PART_TYPES.APPROVAL_REQUEST;
  approvalId: string;
  toolCallId: string;
}>;

type StepBoundaryJournalPart =
  | Readonly<{ type: typeof CHAT_TURN_JOURNAL_PART_TYPES.FINISH_STEP }>
  | Readonly<{ type: typeof CHAT_TURN_JOURNAL_PART_TYPES.START_STEP }>;

type DeniedToolOutputJournalPart = Readonly<{
  type: typeof CHAT_TURN_JOURNAL_PART_TYPES.TOOL_OUTPUT_DENIED;
  toolCallId: string;
}>;

export type ChatTurnJournalPart =
  | ModelCallStreamPart
  | ApprovalRequestJournalPart
  | StepBoundaryJournalPart
  | DeniedToolOutputJournalPart;

/** Convert both published provider parts and DevKit-authored journal records. */
export function toChatTurnUIChunk(part: ChatTurnJournalPart): UIMessageChunk | undefined {
  if (part.type === CHAT_TURN_JOURNAL_PART_TYPES.APPROVAL_REQUEST) {
    return {
      type: CHAT_TURN_JOURNAL_PART_TYPES.APPROVAL_REQUEST,
      approvalId: part.approvalId,
      toolCallId: "toolCallId" in part ? part.toolCallId : part.toolCall.toolCallId,
    };
  }
  if (part.type === CHAT_TURN_JOURNAL_PART_TYPES.FINISH_STEP) {
    return { type: CHAT_TURN_JOURNAL_PART_TYPES.FINISH_STEP };
  }
  if (part.type === CHAT_TURN_JOURNAL_PART_TYPES.START_STEP) {
    return { type: CHAT_TURN_JOURNAL_PART_TYPES.START_STEP };
  }
  if (part.type === CHAT_TURN_JOURNAL_PART_TYPES.TOOL_OUTPUT_DENIED) {
    return {
      type: CHAT_TURN_JOURNAL_PART_TYPES.TOOL_OUTPUT_DENIED,
      toolCallId: part.toolCallId,
    };
  }
  return toUIMessageChunk(part);
}

export function createChatTurnJournalToUIChunkTransform(): TransformStream<
  ChatTurnJournalPart,
  UIMessageChunk
> {
  return new TransformStream({
    start(controller) {
      controller.enqueue({ type: "start" });
      controller.enqueue({ type: CHAT_TURN_JOURNAL_PART_TYPES.START_STEP });
    },
    transform(part, controller) {
      const chunk = toChatTurnUIChunk(part);
      if (chunk !== undefined) controller.enqueue(chunk);
    },
    flush(controller) {
      controller.enqueue({ type: CHAT_TURN_JOURNAL_PART_TYPES.FINISH_STEP });
      controller.enqueue({ type: "finish" });
    },
  });
}
