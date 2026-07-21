import type {
  ClientToolDispatchIdentity,
  ClientToolDispatchSnapshot,
  ClientToolOutputEnvelope,
  ClientToolWorkflowStore,
} from "#application/ports/turn/tools/client-tool-dispatch-store";
import type { TelemetrySink } from "#application/ports/telemetry-sink";
import { recordProcessTelemetry } from "#application/telemetry/process-telemetry";
import { recordTelemetrySafely } from "#application/telemetry/record-telemetry-safely";
import {
  createWorkflowStepStore,
  withWorkflowStepStore,
  type ClosableWorkflowStepStore,
  type WorkflowStepStoreFactory,
} from "#composition/workflow/workflow-step-store";

export type ClientToolResultEnvelope = ClientToolOutputEnvelope;

export type ClientToolDispatchStepCommand =
  | Readonly<{
      operation: "create";
      databaseUrl: string;
      dispatch: ClientToolDispatchIdentity &
        Readonly<{ toolName: string; clientToolCapabilityDigest: string }>;
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

export type ClientToolDispatchStepDependencies = Readonly<{
  createStore: WorkflowStepStoreFactory<ClientToolWorkflowStore & ClosableWorkflowStepStore>;
  telemetry: Pick<TelemetrySink, "record">;
}>;

const DEFAULT_DEPENDENCIES: ClientToolDispatchStepDependencies = {
  createStore: createWorkflowStepStore,
  telemetry: { record: recordProcessTelemetry },
};

/** One explicit Node activity owns every database operation and pool lifetime. */
export async function runClientToolDispatchStep(
  command: ClientToolDispatchStepCommand,
  dependencies: ClientToolDispatchStepDependencies = DEFAULT_DEPENDENCIES,
): Promise<ClientToolDispatchSnapshot | undefined> {
  "use step";

  const snapshot = await withWorkflowStepStore(
    command.databaseUrl,
    dependencies.createStore,
    (store) => executeClientToolDispatch(command, store),
  );
  recordDispatchTelemetry(command, snapshot, dependencies.telemetry);
  return snapshot;
}

async function executeClientToolDispatch(
  command: ClientToolDispatchStepCommand,
  store: ClientToolWorkflowStore,
): Promise<ClientToolDispatchSnapshot | undefined> {
  if (command.operation === "create") return store.create(command.dispatch);
  if (command.operation === "read") return store.read(command.dispatch);
  if (command.operation === "timeout") {
    return store.claimTimeout(command.dispatch, command.output);
  }
  return store.claimAbort(command.dispatch, command.output);
}

function recordDispatchTelemetry(
  command: ClientToolDispatchStepCommand,
  snapshot: ClientToolDispatchSnapshot | undefined,
  telemetry: Pick<TelemetrySink, "record">,
): void {
  const outcomeTag = dispatchOutcome(command.operation, snapshot);
  if (outcomeTag === undefined) return;
  const labels =
    command.operation === "create"
      ? {
          operation: "client_tool_wait",
          outcomeTag,
          toolName: command.dispatch.toolName,
        }
      : { operation: "client_tool_wait", outcomeTag };
  recordTelemetrySafely(telemetry, {
    type: "client_tool.wait",
    labels,
    count: 1,
  });
}

function dispatchOutcome(
  operation: ClientToolDispatchStepCommand["operation"],
  snapshot: ClientToolDispatchSnapshot | undefined,
): string | undefined {
  if (operation === "create" && snapshot?.state === "dispatched") return "started";
  if (operation === "timeout" && snapshot?.state === "timed_out") return "timed_out";
  if (operation === "abort" && snapshot?.state === "aborted") return "cancelled";
  return undefined;
}
