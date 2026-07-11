import { HookNotFoundError } from "workflow/internal/errors";
import { resumeHook } from "workflow/api";

import type { ClientToolOutputEnvelope } from "#application/ports/turn/tools/client-tool-dispatch-store";

/** Testing route facade for the same stable hook-token contract used in production. */
export async function resumeTestingClientToolResult(
  runId: string,
  toolCallId: string,
  output: ClientToolOutputEnvelope,
): Promise<boolean> {
  try {
    await resumeHook(`tool:${runId}:${toolCallId}`, output);
    return true;
  } catch (error) {
    if (HookNotFoundError.is(error)) return false;
    throw error;
  }
}
