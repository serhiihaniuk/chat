import {
  CLIENT_TOOL_DISPATCH_LOOKUP,
  CLIENT_TOOL_OUTPUT_STATES,
  type ClientToolDispatchStore,
  type ClientToolOutputEnvelope,
} from "#application/ports/turn/tools/client-tool-dispatch-store";
import {
  TURN_REJECTION_CODES,
  TurnRejectedError,
} from "#application/turn/turn-errors";
import type { AuthContext } from "#domain/auth-context";

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
  readOutput: ReadClientToolOutput;
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
  );
  if (dispatch === CLIENT_TOOL_DISPATCH_LOOKUP.NOT_FOUND) {
    throw new TurnRejectedError(
      TURN_REJECTION_CODES.RUN_NOT_FOUND,
      "Client tool call not found",
    );
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
    submitted.valid
      ? CLIENT_TOOL_OUTPUT_STATES.SETTLED
      : CLIENT_TOOL_OUTPUT_STATES.FAILED,
    submitted.output,
  );

  // A duplicate retries wake-up because an earlier resume may have raced hook
  // registration or failed transiently after the database commit. A late value
  // never re-enters a model run whose timeout outcome already won.
  if (!isClosedWithoutResume(result.state)) {
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

function isClosedWithoutResume(state: string): boolean {
  return state === "late" || state === "timed_out" || state === "aborted";
}
