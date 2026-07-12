import { resumeHook } from "workflow/api";
import {
  HookNotFoundError,
  RunExpiredError,
  WorkflowRunNotFoundError,
} from "workflow/internal/errors";

export function toolApprovalHookToken(runId: string, approvalId: string): string {
  return `approval:${runId}:${approvalId}`;
}

/** Wake a durable approval wait; the database row remains the decision authority. */
export async function resumeToolApproval(runId: string, approvalId: string): Promise<boolean> {
  try {
    await resumeHook(toolApprovalHookToken(runId, approvalId), true);
    return true;
  } catch (error) {
    if (
      HookNotFoundError.is(error) ||
      WorkflowRunNotFoundError.is(error) ||
      RunExpiredError.is(error)
    ) {
      return false;
    }
    throw error;
  }
}
