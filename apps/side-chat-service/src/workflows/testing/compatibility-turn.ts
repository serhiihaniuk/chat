import {
  createModelCallToUIChunkTransform,
  type ModelCallStreamPart,
  type ProviderOptions,
  WorkflowAgent,
  type WorkflowAgentOptions,
} from "@ai-sdk/workflow";
import { convertToModelMessages, isStepCount, type UIMessage, type UIMessageChunk } from "ai";
import { createHook, getWritable } from "workflow";
import { resumeHook, start } from "workflow/api";

import { initializeTestingWorkflowServices } from "#composition/workflow/testing";
import { assertModelInstance } from "#application/ports/model-provider";

import { patchWorkflowRealmAbortSignal } from "../realm/abort-signal-patch.js";

export const COMPATIBILITY_MODEL_BEHAVIORS = {
  COMPLETE: "complete",
  BLOCK: "block",
} as const;

const COMPATIBILITY_OUTCOMES = {
  COMPLETED: "completed",
  STREAM_REJECTED: "stream-rejected",
} as const;

const COMPATIBILITY_WORKFLOW = {
  AGENT_ID: "side-chat-turn",
  CANCELLATION_HOOK_PREFIX: "turn-cancel",
  CANCELLATION_REASON: "user pressed stop",
  INSTRUCTIONS: "You are the Side Chat compatibility turn agent.",
  MAX_RETRIES: 0,
  MAX_STEPS: 1,
  PROBE_AGENT_ID: "side-chat-unpatched-probe",
  PROBE_REQUEST_ID: "unpatched-probe",
} as const;

type CompatibilityModelBehavior =
  (typeof COMPATIBILITY_MODEL_BEHAVIORS)[keyof typeof COMPATIBILITY_MODEL_BEHAVIORS];

export interface CompatibilityTurnRequest {
  readonly requestId: string;
  readonly mode: CompatibilityModelBehavior;
  readonly messages: UIMessage[];
}

export type CompatibilityTurnOutcome =
  | {
      readonly status: typeof COMPATIBILITY_OUTCOMES.COMPLETED;
      readonly finalText: string;
    }
  | {
      readonly status: typeof COMPATIBILITY_OUTCOMES.STREAM_REJECTED;
      readonly errorName: string;
      readonly errorMessage: string;
    };

interface TurnCancellation {
  readonly reason: string;
}

export function turnCancellationHookToken(requestId: string): string {
  return `${COMPATIBILITY_WORKFLOW.CANCELLATION_HOOK_PREFIX}:${requestId}`;
}

export interface StartedCompatibilityTurn {
  readonly runId: string;
  readonly stream: ReadableStream<UIMessageChunk>;
}

/** Route-side Workflow entry; HTTP adapters do not reach engine APIs directly. */
export async function startCompatibilityTurn(
  request: CompatibilityTurnRequest,
): Promise<StartedCompatibilityTurn> {
  const run = await start(runCompatibilityTurn, [request]);
  return {
    runId: run.runId,
    stream: run.getReadable<ModelCallStreamPart>().pipeThrough(createModelCallToUIChunkTransform()),
  };
}

export async function cancelCompatibilityTurn(requestId: string): Promise<boolean> {
  try {
    await resumeHook(turnCancellationHookToken(requestId), {
      reason: COMPATIBILITY_WORKFLOW.CANCELLATION_REASON,
    });
    return true;
  } catch {
    return false;
  }
}

export async function runUnpatchedAbortSignalProbe(): Promise<CompatibilityTurnOutcome> {
  const run = await start(probeUnpatchedAbortSignal, []);
  return run.returnValue;
}

/**
 * The request enters in the workflow realm and the model call runs in a host
 * step. The outbound adapter preserves cancellation across that boundary.
 *
 * Cancellation flows from the durable hook to the provider abort signal while
 * racing the agent stream (hook resume -> AbortController.abort -> the abort
 * reaches the in-flight provider call). `run.cancel()` is NOT the mechanism —
 * the evidence shows it marks the run cancelled without ever aborting an
 * in-flight provider call.
 */
export async function runCompatibilityTurn(
  request: CompatibilityTurnRequest,
): Promise<CompatibilityTurnOutcome> {
  "use workflow";

  const controller = new AbortController();
  patchWorkflowRealmAbortSignal(controller.signal);

  const cancellation = createHook<TurnCancellation>({
    token: turnCancellationHookToken(request.requestId),
  });
  const { modelProvider } = initializeTestingWorkflowServices();
  const resolvedModel = modelProvider.modelFor({
    modelId: request.mode,
    requestId: request.requestId,
  });
  assertModelInstance(resolvedModel.model);

  const agent = new WorkflowAgent(
    createCompatibilityAgentOptions({
      id: COMPATIBILITY_WORKFLOW.AGENT_ID,
      model: resolvedModel.model,
      providerOptions: resolvedModel.providerOptions,
    }),
  );

  const modelMessages = await convertToModelMessages(request.messages);

  const streamOutcome = agent
    .stream({
      messages: modelMessages,
      writable: getWritable(),
      abortSignal: controller.signal,
    })
    .then(completedOutcome, rejectedOutcome);

  const abortOnCancellation = async (): Promise<CompatibilityTurnOutcome> => {
    const payload = await cancellation;
    controller.abort(payload.reason);
    return streamOutcome;
  };

  return await Promise.race([streamOutcome, abortOnCancellation()]);
}

/**
 * Guard for the patch removal criterion: the identical agent call WITHOUT the
 * realm patch. Today it must reject with the `instanceof` TypeError from the
 * AI SDK's mergeAbortSignals. When a dependency bump makes this probe stream
 * successfully, the upstream fix has shipped: delete
 * `abort-signal-patch.ts` and this probe in the same change.
 */
export async function probeUnpatchedAbortSignal(): Promise<CompatibilityTurnOutcome> {
  "use workflow";

  const controller = new AbortController();
  const { modelProvider } = initializeTestingWorkflowServices();
  const resolvedModel = modelProvider.modelFor({
    modelId: COMPATIBILITY_MODEL_BEHAVIORS.COMPLETE,
    requestId: COMPATIBILITY_WORKFLOW.PROBE_REQUEST_ID,
  });
  assertModelInstance(resolvedModel.model);
  const agent = new WorkflowAgent(
    createCompatibilityAgentOptions({
      id: COMPATIBILITY_WORKFLOW.PROBE_AGENT_ID,
      model: resolvedModel.model,
      providerOptions: resolvedModel.providerOptions,
    }),
  );

  return await agent
    .stream({
      messages: [{ role: "user", content: "probe" }],
      writable: getWritable(),
      abortSignal: controller.signal,
    })
    .then(completedOutcome, rejectedOutcome);
}

function completedOutcome(result: { steps: Array<{ text: string }> }): CompatibilityTurnOutcome {
  return {
    status: COMPATIBILITY_OUTCOMES.COMPLETED,
    finalText: result.steps.at(-1)?.text ?? "",
  };
}

function rejectedOutcome(error: unknown): CompatibilityTurnOutcome {
  if (error instanceof Error) {
    return {
      status: COMPATIBILITY_OUTCOMES.STREAM_REJECTED,
      errorName: error.name,
      errorMessage: error.message,
    };
  }
  return {
    status: COMPATIBILITY_OUTCOMES.STREAM_REJECTED,
    errorName: "unknown",
    errorMessage: String(error),
  };
}

function createCompatibilityAgentOptions(options: {
  readonly id: string;
  readonly model: WorkflowAgentOptions["model"];
  readonly providerOptions: ProviderOptions | undefined;
}): WorkflowAgentOptions {
  const agentOptions: WorkflowAgentOptions = {
    id: options.id,
    model: options.model,
    instructions: COMPATIBILITY_WORKFLOW.INSTRUCTIONS,
    stopWhen: isStepCount(COMPATIBILITY_WORKFLOW.MAX_STEPS),
    maxRetries: COMPATIBILITY_WORKFLOW.MAX_RETRIES,
  };
  if (options.providerOptions !== undefined) {
    agentOptions.providerOptions = options.providerOptions;
  }
  return agentOptions;
}
