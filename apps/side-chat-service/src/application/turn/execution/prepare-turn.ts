import type { SideChatReasoningEffort } from "@side-chat/stream-profile";

import type { TurnAdmission, TurnAdmissionLease } from "#application/ports/turn/turn-admission";
import type { StartedTurnExecution, TurnExecution } from "#application/ports/turn/turn-execution";
import {
  BEGIN_TURN_DISPOSITIONS,
  type BegunTurn,
  type TurnStore,
} from "#application/ports/turn/turn-store";
import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";
import type { TurnModelPolicy } from "#application/turn/turn-model-policy";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { AuthContext } from "#domain/auth-context";
import type { HostContext } from "#domain/host-context";
import {
  TURN_EXECUTION_ERROR_CODES,
  TURN_TERMINAL_STATUSES,
  ZERO_TURN_USAGE,
  type TurnMessage,
  type TurnRef,
} from "#domain/turn/turn";

import { renderHostContextForExecution } from "./host-context/render-host-context.js";

export type PrepareTurnInput = Readonly<{
  auth: AuthContext;
  conversationId: string;
  requestId: string;
  requestedModelId?: string | undefined;
  requestedReasoningEffort?: SideChatReasoningEffort | undefined;
  messages: readonly TurnMessage[];
  acceptedUserMessage: TurnMessage;
  hostContext?: HostContext | undefined;
  clientTools?: readonly ClientToolDefinition[];
  enabledToolNames?: readonly string[] | undefined;
}>;

export type PreparedTurn = Readonly<{
  turn: TurnRef;
  execution: StartedTurnExecution;
  admission: TurnAdmissionLease;
}>;

export type PrepareTurnDependencies = Readonly<{
  modelPolicy: TurnModelPolicy;
  admission: TurnAdmission;
  turns: TurnStore;
  execution: TurnExecution;
}>;

/**
 * Owns the pre-execution transaction order. Policy rejection happens before
 * writes; once accepted, the user message remains audit history even if the
 * workflow cannot start. The caller retains the admission lease until terminal
 * finalization, while a failed start releases it here.
 */
export async function prepareTurn(
  dependencies: PrepareTurnDependencies,
  input: PrepareTurnInput,
): Promise<PreparedTurn> {
  const model = dependencies.modelPolicy(input.requestedModelId, input.requestedReasoningEffort);
  await dependencies.turns.assertCanBegin(input.auth, input.conversationId, input.requestId);
  const admission = await dependencies.admission.admitTurn(input.conversationId);

  try {
    const begun = await dependencies.turns.beginTurn({
      auth: input.auth,
      conversationId: input.conversationId,
      requestId: input.requestId,
      userMessage: input.acceptedUserMessage,
    });
    const executionMessages = renderHostContextForExecution(
      input.messages,
      input.acceptedUserMessage,
      input.hostContext,
    );
    const executionInput = {
      ...toTurnRef(begun),
      auth: input.auth,
      requestId: input.requestId,
      modelId: model.modelId,
      ...(model.reasoningEffort === undefined ? {} : { reasoningEffort: model.reasoningEffort }),
      messages: executionMessages,
      clientTools: input.clientTools ?? [],
      ...(input.enabledToolNames === undefined ? {} : { enabledToolNames: input.enabledToolNames }),
    };
    const turn = toTurnRef(begun);
    const execution = await beginExecution(dependencies, begun, executionInput);
    if (begun.disposition === BEGIN_TURN_DISPOSITIONS.CREATED) {
      await dependencies.turns.bindRun(turn, execution.runId);
    }
    return { turn, execution, admission };
  } catch (error) {
    await admission.release();
    throw error;
  }
}

async function beginExecution(
  dependencies: PrepareTurnDependencies,
  begun: BegunTurn,
  input: Parameters<TurnExecution["start"]>[0],
): Promise<StartedTurnExecution> {
  const turn = toTurnRef(begun);
  if (begun.disposition === BEGIN_TURN_DISPOSITIONS.CREATED) {
    return startExecution(dependencies, turn, input);
  }
  if (begun.runId === undefined) {
    throw new TurnRejectedError(
      TURN_REJECTION_CODES.RUN_NOT_READY,
      "The accepted turn is waiting for its durable run",
      1,
    );
  }
  return dependencies.execution.resume(begun.runId, input);
}

const toTurnRef = (begun: BegunTurn): TurnRef => ({
  conversationId: begun.conversationId,
  turnId: begun.turnId,
  workspaceId: begun.workspaceId,
  subjectId: begun.subjectId,
});

async function startExecution(
  dependencies: PrepareTurnDependencies,
  turn: TurnRef,
  input: Parameters<TurnExecution["start"]>[0],
): Promise<StartedTurnExecution> {
  try {
    return await dependencies.execution.start(input);
  } catch (error) {
    await dependencies.turns.finalize(turn, {
      terminal: {
        status: TURN_TERMINAL_STATUSES.FAILED,
        usage: ZERO_TURN_USAGE,
        safeErrorCode: TURN_EXECUTION_ERROR_CODES.WORKFLOW_FAILED,
      },
    });
    throw error;
  }
}
