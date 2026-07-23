import type { UIMessageChunk } from "ai";

/**
 * Source representation: pinned Workflow replay can repeat a completed tool
 * step and omit AI SDK's `dynamic` marker.
 *
 * Target contract: one native dynamic client-tool step enters the common HTTP
 * scrub chain. The current server-tool catalog is empty, so every replayed tool
 * call is client-owned. If server-tool replays enter this transform, callers must
 * pass explicit ownership instead of inferring it here.
 *
 * Preserved invariant: ordinary content streams immediately and incomplete
 * cursor suffixes keep their order. The transform holds only `start-step` long
 * enough to identify a repeated tool step; it never buffers a live text step.
 */
export function normalizeClientToolReplay(): TransformStream<UIMessageChunk, UIMessageChunk> {
  const completedToolCalls = new Set<string>();
  let activeStep: ReplayStep | undefined;

  return new TransformStream({
    transform(chunk, controller) {
      if (chunk.type === "start-step") {
        flushInterruptedStep(activeStep, controller);
        activeStep = {
          start: chunk,
          mode: "pending",
          toolCallIds: new Set(),
        };
        return;
      }
      if (activeStep === undefined) {
        controller.enqueue(markClientToolChunk(chunk));
        return;
      }
      if (chunk.type === "finish-step") {
        finishStep(activeStep, chunk, completedToolCalls, controller);
        activeStep = undefined;
        return;
      }
      forwardStepChunk(activeStep, chunk, completedToolCalls, controller);
    },
    flush(controller) {
      flushInterruptedStep(activeStep, controller);
    },
  });
}

type ReplayStep = {
  readonly start: UIMessageChunk;
  mode: "pending" | "passing" | "suppressing";
  readonly toolCallIds: Set<string>;
};

function forwardStepChunk(
  step: ReplayStep,
  chunk: UIMessageChunk,
  completedToolCalls: Set<string>,
  controller: TransformStreamDefaultController<UIMessageChunk>,
): void {
  const toolCallId = replayToolCallId(chunk);
  if (step.mode === "pending") {
    if (toolCallId !== undefined && completedToolCalls.has(toolCallId)) {
      step.mode = "suppressing";
      return;
    }
    controller.enqueue(step.start);
    step.mode = "passing";
  }
  if (step.mode === "suppressing") return;
  if (toolCallId !== undefined) {
    if (completedToolCalls.has(toolCallId)) return;
    step.toolCallIds.add(toolCallId);
  }
  controller.enqueue(markClientToolChunk(chunk));
}

function finishStep(
  step: ReplayStep,
  finish: UIMessageChunk,
  completedToolCalls: Set<string>,
  controller: TransformStreamDefaultController<UIMessageChunk>,
): void {
  if (step.mode === "suppressing") return;
  if (step.mode === "pending") controller.enqueue(step.start);
  controller.enqueue(finish);
  for (const toolCallId of step.toolCallIds) completedToolCalls.add(toolCallId);
}

function flushInterruptedStep(
  step: ReplayStep | undefined,
  controller: TransformStreamDefaultController<UIMessageChunk>,
): void {
  if (step?.mode === "pending") controller.enqueue(step.start);
}

function replayToolCallId(chunk: UIMessageChunk): string | undefined {
  if (
    chunk.type === "tool-input-start" ||
    chunk.type === "tool-input-delta" ||
    chunk.type === "tool-input-available" ||
    chunk.type === "tool-input-error" ||
    chunk.type === "tool-output-available" ||
    chunk.type === "tool-output-error"
  ) {
    return chunk.toolCallId;
  }
  return undefined;
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
