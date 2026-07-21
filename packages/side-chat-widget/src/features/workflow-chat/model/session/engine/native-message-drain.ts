import { readUIMessageStream, type FinishReason, type UIMessageChunk } from "ai";
import { sideChatMessageMetadataSchema } from "@side-chat/stream-profile";

import type { WorkflowUIMessage } from "#entities/workflow-chat";

export type WorkflowWidgetChatStreamEnd = Readonly<{
  finishReason: FinishReason | undefined;
  serverAborted: boolean;
}>;

export type WorkflowWidgetChatDrainScheduler = Readonly<{
  maxMessagesPerSlice: number;
  maxSliceMs: number;
  now: () => number;
  yieldToBrowser: (abortSignal: AbortSignal) => Promise<void>;
}>;

type NativeStreamTerminal = {
  finishReason: FinishReason | undefined;
  serverAborted: boolean;
};

type ProgressiveMessagePublisher = Readonly<{
  publish: (message: WorkflowUIMessage) => Promise<void> | undefined;
  finish: () => Promise<void>;
}>;

const WORKFLOW_WIDGET_STREAM_DRAIN = {
  MAX_MESSAGES_PER_SLICE: 64,
  MAX_SLICE_MS: 8,
} as const;

const DEFAULT_DRAIN_SCHEDULER: WorkflowWidgetChatDrainScheduler = {
  maxMessagesPerSlice: WORKFLOW_WIDGET_STREAM_DRAIN.MAX_MESSAGES_PER_SLICE,
  maxSliceMs: WORKFLOW_WIDGET_STREAM_DRAIN.MAX_SLICE_MS,
  now: () => performance.now(),
  yieldToBrowser,
};

/** Inspect native lifecycle chunks and publish bounded cumulative message projections. */
export async function consumeNativeMessages(
  stream: ReadableStream<UIMessageChunk>,
  input: Readonly<{
    onMessage: (message: WorkflowUIMessage) => void;
    onStreamEnded: (end: WorkflowWidgetChatStreamEnd) => void;
  }>,
  abortSignal: AbortSignal,
  scheduler: WorkflowWidgetChatDrainScheduler = DEFAULT_DRAIN_SCHEDULER,
): Promise<void> {
  const terminal: NativeStreamTerminal = {
    finishReason: undefined,
    serverAborted: false,
  };
  // Native projections are cumulative. Publish only the newest projection in
  // each bounded slice so packed replay cannot force one React render per token.
  const publisher = createProgressiveMessagePublisher(input.onMessage, abortSignal, scheduler);
  const inspected = inspectNativeStream(stream, terminal);

  for await (const message of readUIMessageStream<WorkflowUIMessage>({
    stream: inspected,
    terminateOnError: true,
  })) {
    if (abortSignal.aborted) return;
    const backpressure = publisher.publish(message);
    if (backpressure) await backpressure;
  }

  await publisher.finish();
  if (abortSignal.aborted) return;
  input.onStreamEnded(terminal);
}

function inspectNativeStream(
  stream: ReadableStream<UIMessageChunk>,
  terminal: NativeStreamTerminal,
): ReadableStream<UIMessageChunk> {
  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        const inspected = inspectNativeChunk(chunk, terminal);
        if (inspected) controller.enqueue(inspected);
      },
    }),
  );
}

function inspectNativeChunk(
  chunk: UIMessageChunk,
  terminal: NativeStreamTerminal,
): UIMessageChunk | undefined {
  if (chunk.type === "finish") terminal.finishReason = chunk.finishReason;
  if (chunk.type === "abort") terminal.serverAborted = true;
  // Error chunks are server lifecycle input. Durable metadata/snapshot owns
  // the terminal, so do not misclassify them as a dropped HTTP transport.
  if (chunk.type === "error") return undefined;
  return validateChunkMetadata(chunk);
}

function createProgressiveMessagePublisher(
  onMessage: (message: WorkflowUIMessage) => void,
  abortSignal: AbortSignal,
  scheduler: WorkflowWidgetChatDrainScheduler,
): ProgressiveMessagePublisher {
  let messagesInSlice = 0;
  let pendingMessage: WorkflowUIMessage | undefined;
  let scheduledFlush: Promise<void> | undefined;
  let sliceStartedAt = scheduler.now();

  const flush = (): void => {
    if (!pendingMessage || abortSignal.aborted) return;
    onMessage(pendingMessage);
    pendingMessage = undefined;
    messagesInSlice = 0;
    sliceStartedAt = scheduler.now();
  };
  const scheduleFlush = (): Promise<void> => {
    scheduledFlush ??= scheduler.yieldToBrowser(abortSignal).then(() => {
      flush();
      scheduledFlush = undefined;
    });
    return scheduledFlush;
  };

  return {
    publish: (message) => {
      pendingMessage = message;
      messagesInSlice += 1;
      const sliceExpired = scheduler.now() - sliceStartedAt >= scheduler.maxSliceMs;
      if (messagesInSlice < scheduler.maxMessagesPerSlice && !sliceExpired) {
        void scheduleFlush();
        return;
      }
      flush();
      return scheduledFlush ?? scheduler.yieldToBrowser(abortSignal);
    },
    finish: async () => {
      if (scheduledFlush) await scheduledFlush;
      flush();
    },
  };
}

function validateChunkMetadata(chunk: UIMessageChunk): UIMessageChunk {
  if (!("messageMetadata" in chunk)) return chunk;
  const validation = sideChatMessageMetadataSchema["~standard"].validate(chunk.messageMetadata);
  if ("issues" in validation) throw new Error("Workflow stream metadata is invalid.");
  switch (chunk.type) {
    case "start":
      return { ...chunk, messageMetadata: validation.value };
    case "finish":
      return { ...chunk, messageMetadata: validation.value };
    case "message-metadata":
      return { ...chunk, messageMetadata: validation.value };
  }
}

function yieldToBrowser(abortSignal: AbortSignal): Promise<void> {
  if (abortSignal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      abortSignal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, 0);
    abortSignal.addEventListener("abort", finish, { once: true });
  });
}
