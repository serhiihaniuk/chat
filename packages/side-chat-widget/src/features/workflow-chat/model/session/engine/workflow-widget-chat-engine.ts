import { readUIMessageStream, type FinishReason, type UIMessageChunk } from "ai";
import { toClientToolDefinitions, type WidgetHostBridge } from "@side-chat/host-bridge";
import { sideChatMessageMetadataSchema } from "@side-chat/stream-profile";

import {
  createWorkflowChatTransport,
  type WorkflowConversationClient,
  type WorkflowUIMessage,
} from "#entities/workflow-chat";

export type WorkflowWidgetChatAttachmentMode =
  | Readonly<{ kind: "reconnect"; runId: string }>
  | Readonly<{
      kind: "send";
      messageId: string | undefined;
      trigger: "regenerate-message" | "submit-message";
    }>;

export type WorkflowWidgetChatStreamEnd = Readonly<{
  finishReason: FinishReason | undefined;
  serverAborted: boolean;
}>;

export type WorkflowWidgetChatEngine = Readonly<{
  dispose: () => void;
  start: () => Promise<void>;
}>;

type CreateWorkflowWidgetChatEngineInput = Readonly<{
  client: WorkflowConversationClient;
  hostBridge: WidgetHostBridge | undefined;
  includeHostContext: boolean;
  messages: readonly WorkflowUIMessage[];
  mode: WorkflowWidgetChatAttachmentMode;
  onMessage: (message: WorkflowUIMessage) => void;
  onRunAccepted: (runId: string) => void;
  onStreamEnded: (end: WorkflowWidgetChatStreamEnd) => void;
  onTransportDropped: (error: unknown) => void;
  onTransportReconnecting: () => void;
  onTransportRecovered: () => void;
}>;

type WorkflowWidgetChatDrainScheduler = Readonly<{
  maxMessagesPerSlice: number;
  maxSliceMs: number;
  now: () => number;
  yieldToBrowser: (abortSignal: AbortSignal) => Promise<void>;
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

/**
 * Read one immutable attachment epoch without owning conversation state.
 * Progressive native messages leave only through callbacks into the reducer.
 */
export function createWorkflowWidgetChatEngine(
  input: CreateWorkflowWidgetChatEngineInput,
): WorkflowWidgetChatEngine {
  const abortController = new AbortController();
  const transport = createWorkflowChatTransport({
    getClient: () => input.client,
    getClientTools: () => readClientTools(input.hostBridge),
    getHostContext: (request) => readHostContext(input, request),
    getReconnectRunId: () => (input.mode.kind === "reconnect" ? input.mode.runId : undefined),
    onReconnectConnected: input.onTransportRecovered,
    onReconnectStarted: input.onTransportReconnecting,
    onRunFinished: () => undefined,
    onRunStarted: input.onRunAccepted,
  });

  return {
    dispose: () => abortController.abort(),
    start: async () => {
      try {
        const stream = await openStream(transport, input, abortController.signal);
        if (abortController.signal.aborted) return;
        if (!stream) {
          input.onStreamEnded({ finishReason: undefined, serverAborted: false });
          return;
        }
        await consumeNativeMessages(stream, input, abortController.signal);
      } catch (error) {
        if (!abortController.signal.aborted) input.onTransportDropped(error);
      }
    },
  };
}

async function openStream(
  transport: ReturnType<typeof createWorkflowChatTransport>,
  input: CreateWorkflowWidgetChatEngineInput,
  abortSignal: AbortSignal,
): Promise<ReadableStream<UIMessageChunk> | null> {
  if (input.mode.kind === "reconnect") {
    return transport.reconnectToStream({
      abortSignal,
      chatId: input.client.conversationId,
    });
  }
  return transport.sendMessages({
    abortSignal,
    chatId: input.client.conversationId,
    messageId: input.mode.messageId,
    messages: [...input.messages],
    trigger: input.mode.trigger,
  });
}

export async function consumeNativeMessages(
  stream: ReadableStream<UIMessageChunk>,
  input: Pick<CreateWorkflowWidgetChatEngineInput, "onMessage" | "onStreamEnded">,
  abortSignal: AbortSignal,
  scheduler: WorkflowWidgetChatDrainScheduler = DEFAULT_DRAIN_SCHEDULER,
): Promise<void> {
  let finishReason: FinishReason | undefined;
  let messagesInSlice = 0;
  let pendingMessage: WorkflowUIMessage | undefined;
  let scheduledFlush: Promise<void> | undefined;
  let serverAborted = false;
  let sliceStartedAt = scheduler.now();
  const flushPendingMessage = (): void => {
    if (!pendingMessage || abortSignal.aborted) return;
    input.onMessage(pendingMessage);
    pendingMessage = undefined;
    messagesInSlice = 0;
    sliceStartedAt = scheduler.now();
  };
  const schedulePendingFlush = (): Promise<void> => {
    scheduledFlush ??= scheduler.yieldToBrowser(abortSignal).then(() => {
      flushPendingMessage();
      scheduledFlush = undefined;
    });
    return scheduledFlush;
  };
  const inspected = stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (chunk.type === "finish") finishReason = chunk.finishReason;
        if (chunk.type === "abort") serverAborted = true;
        // Error chunks are server lifecycle input. Durable metadata/snapshot owns
        // the terminal, so do not misclassify them as a dropped HTTP transport.
        if (chunk.type === "error") return;
        controller.enqueue(validateChunkMetadata(chunk));
      },
    }),
  );
  for await (const message of readUIMessageStream<WorkflowUIMessage>({
    stream: inspected,
    terminateOnError: true,
  })) {
    if (abortSignal.aborted) return;
    // readUIMessageStream projections are cumulative. Consume every native
    // part, but publish only the newest projection in each bounded slice so a
    // packed durable replay cannot force one React render per historical token.
    pendingMessage = message;
    messagesInSlice += 1;
    const sliceExpired = scheduler.now() - sliceStartedAt >= scheduler.maxSliceMs;
    if (messagesInSlice < scheduler.maxMessagesPerSlice && !sliceExpired) {
      void schedulePendingFlush();
      continue;
    }
    flushPendingMessage();
    await (scheduledFlush ?? scheduler.yieldToBrowser(abortSignal));
    if (abortSignal.aborted) return;
  }
  if (scheduledFlush) await scheduledFlush;
  if (abortSignal.aborted) return;
  flushPendingMessage();
  input.onStreamEnded({ finishReason, serverAborted });
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

async function readClientTools(
  hostBridge: WidgetHostBridge | undefined,
): Promise<ReturnType<typeof toClientToolDefinitions>> {
  try {
    const capabilities = await hostBridge?.getCapabilities?.();
    return capabilities ? toClientToolDefinitions(capabilities) : [];
  } catch {
    return [];
  }
}

async function readHostContext(
  input: Pick<CreateWorkflowWidgetChatEngineInput, "hostBridge" | "includeHostContext">,
  request: Parameters<NonNullable<WidgetHostBridge["getContext"]>>[0],
) {
  if (!input.includeHostContext) return undefined;
  return input.hostBridge?.getContext?.(request);
}
