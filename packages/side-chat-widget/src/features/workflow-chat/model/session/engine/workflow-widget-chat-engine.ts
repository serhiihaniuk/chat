import type { UIMessageChunk } from "ai";
import { toClientToolDefinitions, type WidgetHostBridge } from "@side-chat/host-bridge";

import {
  createWorkflowChatTransport,
  type WorkflowConversationClient,
  type WorkflowUIMessage,
} from "#entities/workflow-chat";
import { consumeNativeMessages, type WorkflowWidgetChatStreamEnd } from "./native-message-drain.js";

export type { WorkflowWidgetChatStreamEnd } from "./native-message-drain.js";

export type WorkflowWidgetChatAttachmentMode =
  | Readonly<{
      clientToolCapability?: string | undefined;
      kind: "reconnect";
      runId: string;
    }>
  | Readonly<{
      clientToolCapability: string;
      kind: "send";
      messageId: string | undefined;
      trigger: "regenerate-message" | "submit-message";
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
  onRunAccepted: (runId: string, clientToolCapability: string) => void;
  onStreamEnded: (end: WorkflowWidgetChatStreamEnd) => void;
  onTransportDropped: (error: unknown) => void;
  onTransportReconnecting: () => void;
  onTransportRecovered: () => void;
}>;

const HOST_CAPABILITIES_ERROR_MESSAGE = "Host client-tool capabilities could not be loaded.";

/**
 * Read one immutable attachment epoch without owning conversation state.
 * Progressive native messages leave only through callbacks into the reducer.
 */
export function createWorkflowWidgetChatEngine(
  input: CreateWorkflowWidgetChatEngineInput,
): WorkflowWidgetChatEngine {
  const abortController = new AbortController();
  const transport = createWorkflowChatTransport({
    clientToolCapability: input.mode.clientToolCapability,
    getClient: () => input.client,
    getClientTools: () => readClientTools(input.hostBridge),
    getHostContext: (request) => readHostContext(input, request),
    getReconnectRunId: () => (input.mode.kind === "reconnect" ? input.mode.runId : undefined),
    onReconnectConnected: input.onTransportRecovered,
    onReconnectStarted: input.onTransportReconnecting,
    onRunFinished: () => undefined,
    onRunStarted: (runId) => {
      if (input.mode.kind !== "send") return;
      input.onRunAccepted(runId, input.mode.clientToolCapability);
    },
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

export async function readClientTools(
  hostBridge: WidgetHostBridge | undefined,
): Promise<ReturnType<typeof toClientToolDefinitions>> {
  if (!hostBridge?.getCapabilities) return [];
  try {
    return toClientToolDefinitions(await hostBridge.getCapabilities());
  } catch {
    throw new Error(HOST_CAPABILITIES_ERROR_MESSAGE);
  }
}

async function readHostContext(
  input: Pick<CreateWorkflowWidgetChatEngineInput, "hostBridge" | "includeHostContext">,
  request: Parameters<NonNullable<WidgetHostBridge["getContext"]>>[0],
) {
  if (!input.includeHostContext) return undefined;
  return input.hostBridge?.getContext?.(request);
}
