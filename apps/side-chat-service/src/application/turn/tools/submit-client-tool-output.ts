import {
  CLIENT_TOOL_DISPATCH_LOOKUP,
  CLIENT_TOOL_OUTPUT_STATES,
  type ClientToolDispatchStore,
  type ClientToolOutputEnvelope,
} from "#application/ports/turn/tools/client-tool-dispatch-store";
import type { TelemetrySink } from "#application/ports/telemetry-sink";
import { recordTelemetrySafely } from "#application/telemetry/record-telemetry-safely";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { AuthContext } from "@side-chat/side-chat-server";

export type ReadClientToolOutput = () => Promise<
  | Readonly<{ valid: true; output: ClientToolOutputEnvelope }>
  | Readonly<{ valid: false; output: ClientToolOutputEnvelope }>
>;

export type ResumeClientTool = (
  runId: string,
  toolCallId: string,
  output: ClientToolOutputEnvelope,
) => Promise<boolean>;

export type SubmitClientToolOutputInput = Readonly<{
  auth: AuthContext;
  runId: string;
  toolCallId: string;
  clientToolCapabilityDigest: string;
  readOutput: ReadClientToolOutput;
  telemetry?: Pick<TelemetrySink, "record"> | undefined;
}>;

export type SubmitClientToolOutputAck = Readonly<{
  runId: string;
  toolCallId: string;
  state: string;
  accepted: boolean;
}>;

/**
 * Authenticate the durable dispatch before reading a potentially private or
 * malformed body. Persistence wins every race; a hook is only a wake-up signal.
 */
export async function submitClientToolOutput(
  store: ClientToolDispatchStore,
  resume: ResumeClientTool,
  input: SubmitClientToolOutputInput,
): Promise<SubmitClientToolOutputAck> {
  const dispatch = await store.findOwned(
    input.auth,
    input.runId,
    input.toolCallId,
    input.clientToolCapabilityDigest,
  );
  if (dispatch === CLIENT_TOOL_DISPATCH_LOOKUP.NOT_FOUND) {
    throw new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Client tool call not found");
  }
  if (dispatch === CLIENT_TOOL_DISPATCH_LOOKUP.NOT_READY) {
    throw new TurnRejectedError(
      TURN_REJECTION_CODES.CLIENT_TOOL_NOT_READY,
      "Client tool call is not ready for output",
      1,
    );
  }

  const submitted = await input.readOutput();
  const result = await store.submit(
    dispatch,
    submitted.valid ? CLIENT_TOOL_OUTPUT_STATES.SETTLED : CLIENT_TOOL_OUTPUT_STATES.FAILED,
    submitted.output,
  );
  recordTelemetrySafely(input.telemetry ?? NOOP_TELEMETRY, {
    type: "client_tool.output",
    labels: {
      operation: "client_tool_output",
      outcomeTag: `${result.disposition}.${result.state}`,
    },
    count: 1,
  });

  // Only the first writer of a fresh outcome ("accepted") still has a live hook
  // to wake, so only it must resume. A "duplicate" means an earlier POST already
  // recorded this terminal outcome and woke the run; the hook is legitimately
  // gone, so the retry is acknowledged idempotently with the recorded state. A
  // "late" result recorded its timing but never re-enters a run whose timeout
  // outcome already won. A false resume on the first-writer path means the hook
  // is not yet registered (result-before-hook or restart-before-hook-restore),
  // which stays a retryable conflict until Workflow restores the wait.
  if (result.disposition === "accepted") {
    const resumed = await resume(input.runId, input.toolCallId, result.output);
    if (!resumed) {
      throw new TurnRejectedError(
        TURN_REJECTION_CODES.CLIENT_TOOL_NOT_READY,
        "Client tool output is durable but its workflow is not ready to resume",
        1,
      );
    }
  }

  return {
    runId: input.runId,
    toolCallId: input.toolCallId,
    state: result.state,
    accepted: result.disposition === "accepted",
  };
}

const NOOP_TELEMETRY: Pick<TelemetrySink, "record"> = {
  record: () => undefined,
};
