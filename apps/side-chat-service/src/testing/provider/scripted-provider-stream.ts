import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";

import {
  LATE_CONTENT_MARKER,
  PROVIDER_SCRIPT_MODE,
  type ProviderScriptMode,
} from "../scripted-provider-contract.js";
import {
  PROVIDER_OBSERVATION_EVENT,
  recordProviderObservation,
} from "../scripted-provider-observations.js";
import { approvalToolCallParts } from "./approval-tool-stream-parts.js";
import { clientToolCallParts } from "./client-tool-stream-parts.js";
import { modelStream, NO_OUTPUT_TOKENS, REASONING_OUTPUT_TOKENS } from "./model-stream-parts.js";

const SCRIPTED_STREAM_TEXT = {
  BLOCKING_DELTAS: ["streaming before ", "the abort"],
  PARTIAL_DELTAS: ["partial reply"],
  BLOCKED_TEXT_ID: "blocked-text",
  COMPLETED_TEXT_ID: "scripted-text",
  REASONING_ID: "scripted-reasoning",
} as const;

const PROVIDER_ABORT_ERROR_NAME = "AbortError";
const SCRIPTED_PROVIDER_FAILURE_MESSAGE = "Scripted provider failure";
const CRASH_RECOVERY_COMPLETION_DELAY_MS = 1_000;

export function createScriptedStream(
  requestId: string,
  mode: ProviderScriptMode,
  attemptCount: number,
  abortSignal: AbortSignal | undefined,
  clientToolOutputObserved = false,
): ReadableStream<LanguageModelV4StreamPart> {
  const immediateStream = createImmediateStream(
    requestId,
    mode,
    attemptCount,
    clientToolOutputObserved,
  );
  if (immediateStream !== undefined) return immediateStream;

  if (mode === PROVIDER_SCRIPT_MODE.BLOCK) {
    return blockingStream(
      requestId,
      abortSignal,
      SCRIPTED_STREAM_TEXT.BLOCKING_DELTAS,
      attemptCount,
    );
  }
  if (mode === PROVIDER_SCRIPT_MODE.CRASH_RECOVERY) {
    return delayedCompletionStream(requestId, abortSignal, attemptCount);
  }
  if (mode === PROVIDER_SCRIPT_MODE.CANCEL_MID) {
    return blockingStream(
      requestId,
      abortSignal,
      SCRIPTED_STREAM_TEXT.PARTIAL_DELTAS,
      attemptCount,
    );
  }
  if (mode === PROVIDER_SCRIPT_MODE.CANCEL_BEFORE_FIRST) {
    return blockingStream(requestId, abortSignal, [], attemptCount);
  }
  if (mode === PROVIDER_SCRIPT_MODE.ERROR_BEFORE) {
    return errorStream(requestId, false, attemptCount);
  }
  return errorStream(requestId, true, attemptCount);
}

function createImmediateStream(
  requestId: string,
  mode: ProviderScriptMode,
  attemptCount: number,
  clientToolOutputObserved: boolean,
): ReadableStream<LanguageModelV4StreamPart> | undefined {
  if (mode === PROVIDER_SCRIPT_MODE.COMPLETE || mode === PROVIDER_SCRIPT_MODE.HAPPY) {
    return completedStream(`Scripted reply: ${requestId}`);
  }
  if (mode === PROVIDER_SCRIPT_MODE.TITLE) {
    return completedStream('{"title":"Scripted conversation title"}');
  }
  if (mode === PROVIDER_SCRIPT_MODE.MULTI_STEP) {
    return completedStream(`Scripted step ${attemptCount}: ${requestId}`);
  }
  if (mode === PROVIDER_SCRIPT_MODE.EMPTY) return streamFromParts(completedParts());
  if (mode === PROVIDER_SCRIPT_MODE.STEP_LIMIT) {
    return streamFromParts(completedParts(`Scripted limited reply: ${requestId}`, "length"));
  }
  if (mode === PROVIDER_SCRIPT_MODE.REASONING_ONLY) {
    return streamFromParts(reasoningOnlyParts(`Scripted reasoning: ${requestId}`));
  }
  const approvalGapStream = nativeApprovalGapStream(requestId, mode, attemptCount);
  if (approvalGapStream !== undefined) return approvalGapStream;
  return clientToolStream(requestId, mode, attemptCount, clientToolOutputObserved);
}

function clientToolStream(
  requestId: string,
  mode: ProviderScriptMode,
  attemptCount: number,
  outputObserved: boolean,
): ReadableStream<LanguageModelV4StreamPart> | undefined {
  if (mode !== PROVIDER_SCRIPT_MODE.CLIENT_TOOL) return undefined;
  if (attemptCount === 1) return streamFromParts(clientToolCallParts(requestId));
  return outputObserved
    ? completedStream(`Client tool completed: ${requestId}`)
    : errorStream(requestId, false, attemptCount);
}

function nativeApprovalGapStream(
  requestId: string,
  mode: ProviderScriptMode,
  attemptCount: number,
): ReadableStream<LanguageModelV4StreamPart> | undefined {
  if (mode !== PROVIDER_SCRIPT_MODE.NATIVE_APPROVAL_GAP) return undefined;
  if (attemptCount === 1) return streamFromParts(approvalToolCallParts(requestId));
  return completedStream(`Native approval probe completed: ${requestId}`);
}

function completedStream(text: string): ReadableStream<LanguageModelV4StreamPart> {
  return streamFromParts(completedParts(text));
}

function streamFromParts(
  parts: readonly LanguageModelV4StreamPart[],
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

function blockingStream(
  requestId: string,
  abortSignal: AbortSignal | undefined,
  textBeforeAbort: readonly string[],
  attemptCount: number,
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      if (textBeforeAbort.length > 0) enqueuePartialText(controller, textBeforeAbort);
      recordProviderObservation({
        event: observationEventFor(textBeforeAbort),
        requestId,
        attemptCount,
      });

      // AbortError is an engine contract: a generic failure is retryable and
      // would incorrectly re-run this provider call after cancellation.
      const abort = () => {
        controller.error(new DOMException(abortReasonText(abortSignal), PROVIDER_ABORT_ERROR_NAME));
        recordProviderObservation({
          event: PROVIDER_OBSERVATION_EVENT.ABORTED,
          requestId,
          attemptCount,
          abortObserved: true,
          lateContentAccepted: attemptLateContent(controller),
        });
      };
      if (abortSignal?.aborted) abort();
      else abortSignal?.addEventListener("abort", abort, { once: true });
    },
  });
}

function delayedCompletionStream(
  requestId: string,
  abortSignal: AbortSignal | undefined,
  attemptCount: number,
): ReadableStream<LanguageModelV4StreamPart> {
  const parts = completedParts(`Scripted recovered reply: ${requestId}`);
  const partialParts = parts.slice(0, 3);
  const terminalParts = parts.slice(3);
  return new ReadableStream({
    start(controller) {
      for (const part of partialParts) controller.enqueue(part);
      recordProviderObservation({
        event: PROVIDER_OBSERVATION_EVENT.STREAMING,
        requestId,
        attemptCount,
      });

      let settled = false;
      const abort = () => {
        if (settled) return;
        settled = true;
        clearTimeout(completion);
        controller.error(new DOMException(abortReasonText(abortSignal), PROVIDER_ABORT_ERROR_NAME));
        recordProviderObservation({
          event: PROVIDER_OBSERVATION_EVENT.ABORTED,
          requestId,
          attemptCount,
          abortObserved: true,
        });
      };
      const completion = setTimeout(() => {
        if (settled) return;
        settled = true;
        abortSignal?.removeEventListener("abort", abort);
        for (const part of terminalParts) controller.enqueue(part);
        controller.close();
      }, CRASH_RECOVERY_COMPLETION_DELAY_MS);
      if (abortSignal?.aborted) abort();
      else abortSignal?.addEventListener("abort", abort, { once: true });
    },
  });
}

function errorStream(
  requestId: string,
  emitBeforeError: boolean,
  attemptCount: number,
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      if (emitBeforeError) enqueuePartialText(controller, SCRIPTED_STREAM_TEXT.PARTIAL_DELTAS);
      recordProviderObservation({
        event: PROVIDER_OBSERVATION_EVENT.ERROR,
        requestId,
        attemptCount,
        emittedContent: emitBeforeError,
      });
      controller.enqueue({
        type: "error",
        error: new Error(SCRIPTED_PROVIDER_FAILURE_MESSAGE),
      });
      controller.close();
    },
  });
}

function observationEventFor(
  textBeforeAbort: readonly string[],
): typeof PROVIDER_OBSERVATION_EVENT.STREAMING | typeof PROVIDER_OBSERVATION_EVENT.WAITING {
  if (textBeforeAbort.length > 0) return PROVIDER_OBSERVATION_EVENT.STREAMING;
  return PROVIDER_OBSERVATION_EVENT.WAITING;
}

function enqueuePartialText(
  controller: ReadableStreamDefaultController<LanguageModelV4StreamPart>,
  deltas: readonly string[],
): void {
  const id = SCRIPTED_STREAM_TEXT.BLOCKED_TEXT_ID;
  controller.enqueue({ type: "stream-start", warnings: [] });
  controller.enqueue({ type: "text-start", id });
  for (const delta of deltas) controller.enqueue({ type: "text-delta", id, delta });
}

function abortReasonText(abortSignal: AbortSignal | undefined): string {
  const reason: unknown = abortSignal?.reason;
  return typeof reason === "string" ? reason : "Provider call aborted";
}

function attemptLateContent(
  controller: ReadableStreamDefaultController<LanguageModelV4StreamPart>,
): boolean {
  try {
    controller.enqueue({
      type: "text-delta",
      id: SCRIPTED_STREAM_TEXT.BLOCKED_TEXT_ID,
      delta: LATE_CONTENT_MARKER,
    });
    return true;
  } catch {
    return false;
  }
}

function completedParts(
  text?: string,
  finishReason: "stop" | "length" = "stop",
): readonly LanguageModelV4StreamPart[] {
  if (text === undefined) {
    return modelStream().finish(finishReason, NO_OUTPUT_TOKENS);
  }
  return modelStream().text(text, SCRIPTED_STREAM_TEXT.COMPLETED_TEXT_ID).finish(finishReason);
}

function reasoningOnlyParts(reasoning: string): readonly LanguageModelV4StreamPart[] {
  return modelStream()
    .reasoning(reasoning, SCRIPTED_STREAM_TEXT.REASONING_ID)
    .finish("stop", REASONING_OUTPUT_TOKENS);
}
