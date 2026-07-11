import { WorkflowAgent } from "@ai-sdk/workflow";
import { convertToModelMessages, isStepCount, type UIMessage } from "ai";
import { createHook, getWritable } from "workflow";

import { createScriptedLanguageModel, type ProviderScriptMode } from "./scripted-language-model.js";
import { patchWorkflowRealmAbortSignal } from "./workflow-abort-signal-patch.js";

export interface CompatibilityTurnRequest {
  readonly requestId: string;
  readonly mode: ProviderScriptMode;
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

/**
 * One durable assistant turn. Everything in this function body executes inside
 * the workflow VM realm; the model call itself runs host-side in a step, which
 * is why the scripted model must be serde-capable.
 *
 * Cancellation contract: the turn ends through the durable cancellation hook
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

  const agent = new WorkflowAgent({
    id: "side-chat-turn",
    model: createScriptedLanguageModel(request.requestId, request.mode),
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
 * `workflow-abort-signal-patch.ts` and this probe in the same change.
 */
export async function probeUnpatchedAbortSignal(): Promise<CompatibilityTurnOutcome> {
  "use workflow";

  const controller = new AbortController();

  const agent = new WorkflowAgent({
    id: "side-chat-unpatched-probe",
    model: createScriptedLanguageModel("unpatched-probe", "complete"),
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
