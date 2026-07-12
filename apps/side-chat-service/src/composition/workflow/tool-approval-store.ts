import { createPostgresTurnState } from "#adapters/persistence/postgres-turn-state";
import type { ToolApprovalWorkflowStore } from "#application/ports/turn/tools/tool-approval-store";

export type ClosableToolApprovalWorkflowStore = ToolApprovalWorkflowStore & {
  readonly close: () => Promise<void>;
};

/** Node-only approval store factory consumed exclusively inside Workflow steps. */
export function createToolApprovalWorkflowStore(
  databaseUrl: string,
): ClosableToolApprovalWorkflowStore {
  return createPostgresTurnState(databaseUrl);
}
