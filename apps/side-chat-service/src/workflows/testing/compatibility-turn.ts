import {
  createModelCallToUIChunkTransform,
  type ModelCallStreamPart,
  WorkflowAgent,
} from "@ai-sdk/workflow";
import { convertToModelMessages, isStepCount, type UIMessage, type UIMessageChunk } from "ai";
import { createHook, getWritable } from "workflow";
import { resumeHook, start } from "workflow/api";

import { initializeTestingWorkflowServices } from "#composition/workflow/testing";

import { patchWorkflowRealmAbortSignal } from "../abort-signal-patch.js";

type CompatibilityModelBehavior = "complete" | "block";

export interface CompatibilityTurnRequest {
  readonly requestId: string;
  readonly mode: CompatibilityModelBehavior;
  readonly messages: UIMessage[];
}

export type CompatibilityTurnOutcome =
  | { readonly status: "completed"; readonly finalText: string }
  | {
      readonly status: "stream-rejected";
      readonly errorName: string;
      readonly errorMessage: string;
    };

interface TurnCancellation {
  readonly reason: string;
}

export function turnCancellationHookToken(requestId: string): string {
  return `turn-cancel:${requestId}`;
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
    await resumeHook(turnCancellationHookToken(requestId), { reason: "user pressed stop" });
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

  const agent = new WorkflowAgent({
    id: "side-chat-turn",
    model: modelProvider.modelFor({ modelId: request.mode, requestId: request.requestId }),
    instructions: "You are the Side Chat compatibility turn agent.",
    stopWhen: isStepCount(1),
    maxRetries: 0,
  });

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
  const agent = new WorkflowAgent({
    id: "side-chat-unpatched-probe",
    model: modelProvider.modelFor({ modelId: "complete", requestId: "unpatched-probe" }),
    instructions: "You are the Side Chat compatibility turn agent.",
    stopWhen: isStepCount(1),
    maxRetries: 0,
  });

  return await agent
    .stream({
      messages: [{ role: "user", content: "probe" }],
      writable: getWritable(),
      abortSignal: controller.signal,
    })
    .then(completedOutcome, rejectedOutcome);
}

function completedOutcome(result: { steps: Array<{ text: string }> }): CompatibilityTurnOutcome {
  return { status: "completed", finalText: result.steps.at(-1)?.text ?? "" };
}

function rejectedOutcome(error: unknown): CompatibilityTurnOutcome {
  if (error instanceof Error) {
    return { status: "stream-rejected", errorName: error.name, errorMessage: error.message };
  }
  return { status: "stream-rejected", errorName: "unknown", errorMessage: String(error) };
}
