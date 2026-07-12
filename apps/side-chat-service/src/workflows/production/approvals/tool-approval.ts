import type {
  ToolApprovalInput,
  ToolApprovalIdentity,
  ToolApprovalSnapshot,
} from "#application/ports/turn/tools/tool-approval-store";
import { createServerToolInputDigest } from "#application/turn/tools/server-tools/server-tool-input-digest";
import { createToolApprovalWorkflowStore } from "#composition/workflow/tool-approval-store";

export type ToolApprovalStepCommand =
  | Readonly<{
      operation: "create";
      databaseUrl: string;
      identity: Omit<ToolApprovalIdentity, "inputDigest">;
      input: ToolApprovalInput;
      timeoutMs: number;
    }>
  | Readonly<{
      operation: "read";
      databaseUrl: string;
      identity: Omit<ToolApprovalIdentity, "inputDigest">;
      input: ToolApprovalInput;
    }>
  | Readonly<{
      operation: "expire";
      databaseUrl: string;
      identity: ToolApprovalIdentity;
    }>;

/** One Node activity owns approval digests, persistence, and pool lifetime. */
export async function runToolApprovalStep(
  command: ToolApprovalStepCommand,
): Promise<ToolApprovalSnapshot | undefined> {
  "use step";

  const store = createToolApprovalWorkflowStore(command.databaseUrl);
  try {
    if (command.operation === "expire") {
      return await store.expireApproval(command.identity);
    }
    const inputDigest = await createServerToolInputDigest(command.input);
    const identity = { ...command.identity, inputDigest };
    if (command.operation === "read") return await store.readApproval(identity);
    const requestedAt = new Date().toISOString();
    const expiresAt = new Date(Date.parse(requestedAt) + command.timeoutMs).toISOString();
    return await store.createApproval({ ...identity, requestedAt, expiresAt });
  } finally {
    await store.close();
  }
}
