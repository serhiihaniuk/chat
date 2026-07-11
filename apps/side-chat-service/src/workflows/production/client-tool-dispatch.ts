import type {
  ClientToolDispatchIdentity,
  ClientToolDispatchSnapshot,
  ClientToolOutputEnvelope,
} from "#application/ports/turn/tools/client-tool-dispatch-store";
import { createClientToolWorkflowStore } from "#composition/workflow/client-tool-store";

export type ClientToolResultEnvelope = ClientToolOutputEnvelope;

export type ClientToolDispatchStepCommand =
  | Readonly<{
      operation: "create";
      databaseUrl: string;
      dispatch: ClientToolDispatchIdentity & Readonly<{ toolName: string }>;
    }>
  | Readonly<{
      operation: "read";
      databaseUrl: string;
      dispatch: ClientToolDispatchIdentity;
    }>
  | Readonly<{
      operation: "timeout" | "abort";
      databaseUrl: string;
      dispatch: ClientToolDispatchIdentity;
      output: ClientToolOutputEnvelope;
    }>;

/** One explicit Node activity owns every database operation and pool lifetime. */
export async function runClientToolDispatchStep(
  command: ClientToolDispatchStepCommand,
): Promise<ClientToolDispatchSnapshot | undefined> {
  "use step";

  const store = createClientToolWorkflowStore(command.databaseUrl);
  try {
    if (command.operation === "create")
      return await store.create(command.dispatch);
    if (command.operation === "read") return await store.read(command.dispatch);
    if (command.operation === "timeout") {
      return await store.claimTimeout(command.dispatch, command.output);
    }
    return await store.claimAbort(command.dispatch, command.output);
  } finally {
    await store.close();
  }
}
