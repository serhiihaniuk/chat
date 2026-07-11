import type { UIMessageChunk } from "ai";

/**
 * Source representation: pinned Workflow replay can repeat a completed tool
 * step and omit AI SDK's `dynamic` marker.
 *
 * Target contract: one native dynamic client-tool step enters the common HTTP
 * scrub chain. The current server-tool catalog is empty, so every replayed tool
 * call is client-owned; Step 12 must pass explicit ownership when that changes.
 *
 * Preserved invariant: ordinary content, distinct tool calls, and incomplete
 * cursor suffixes keep their original order. Only a later completed step whose
 * tool-call ids were already emitted is removed.
 */
export function normalizeClientToolReplay(): TransformStream<
  UIMessageChunk,
  UIMessageChunk
> {
  const completedToolCalls = new Set<string>();
  let bufferedStep: UIMessageChunk[] | undefined;

  return new TransformStream({
    transform(chunk, controller) {
      if (chunk.type === "start-step") {
        flushPartialStep(bufferedStep, controller);
        bufferedStep = [chunk];
        return;
      }
      if (bufferedStep === undefined) {
        controller.enqueue(markClientToolChunk(chunk));
        return;
      }

      bufferedStep.push(chunk);
      if (chunk.type !== "finish-step") return;
      flushCompletedStep(bufferedStep, completedToolCalls, controller);
      bufferedStep = undefined;
    },
    flush(controller) {
      flushPartialStep(bufferedStep, controller);
    },
  });
}

function flushCompletedStep(
  step: readonly UIMessageChunk[],
  completedToolCalls: Set<string>,
  controller: TransformStreamDefaultController<UIMessageChunk>,
): void {
  const toolCallIds = step.flatMap(toolInputCallId);
  const repeated =
    toolCallIds.length > 0 &&
    toolCallIds.every((toolCallId) => completedToolCalls.has(toolCallId));
  if (repeated) return;
  for (const chunk of step) controller.enqueue(markClientToolChunk(chunk));
  for (const toolCallId of toolCallIds) completedToolCalls.add(toolCallId);
}

function flushPartialStep(
  step: readonly UIMessageChunk[] | undefined,
  controller: TransformStreamDefaultController<UIMessageChunk>,
): void {
  if (step === undefined) return;
  for (const chunk of step) controller.enqueue(markClientToolChunk(chunk));
}

function toolInputCallId(chunk: UIMessageChunk): string[] {
  if (
    chunk.type !== "tool-input-start" &&
    chunk.type !== "tool-input-available" &&
    chunk.type !== "tool-input-error"
  ) {
    return [];
  }
  return [chunk.toolCallId];
}

function markClientToolChunk(chunk: UIMessageChunk): UIMessageChunk {
  if (
    chunk.type === "tool-input-start" ||
    chunk.type === "tool-input-available" ||
    chunk.type === "tool-input-error" ||
    chunk.type === "tool-output-available" ||
    chunk.type === "tool-output-error"
  ) {
    return { ...chunk, dynamic: true };
  }
  return chunk;
}
