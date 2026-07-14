import { useChat } from "@ai-sdk/react";
import type { ChatStatus } from "ai";
import { toClientToolDefinitions, type WidgetHostBridge } from "@side-chat/host-bridge";
import { isRecord } from "@side-chat/shared";
import { sideChatMessageMetadataSchema } from "@side-chat/stream-profile";
import { useEffect, useRef, useState } from "react";

import {
  cancelWorkflowChatRun,
  createWorkflowChatTransport,
  type WorkflowActiveTurn,
  type WorkflowChatHttpError,
  type WorkflowConversationClient,
  type WorkflowUIMessage,
  WORKFLOW_CHAT_TRANSPORT_ERROR_CODE,
} from "#entities/workflow-chat";
import {
  createWorkflowApprovalDecisionHandler,
  type WorkflowApprovalDecisionHandler,
  type WorkflowApprovalDecisions,
} from "./approval/workflow-approval.js";
import { createWorkflowClientToolCallHandler } from "./client-tools/workflow-client-tool-callback.js";
import {
  createWorkflowChatErrorHandler,
  createWorkflowChatFinishHandler,
  type WorkflowChatTerminal,
} from "./terminal/workflow-chat-terminal.js";

export const WORKFLOW_WIDGET_CHAT_STATUS = {
  ERROR: "error",
  IDLE: "idle",
  STREAMING: "streaming",
  SUBMITTED: "submitted",
} as const;

export type WorkflowWidgetChatStatus =
  (typeof WORKFLOW_WIDGET_CHAT_STATUS)[keyof typeof WORKFLOW_WIDGET_CHAT_STATUS];

export type { WorkflowChatTerminal } from "./terminal/workflow-chat-terminal.js";

export type {
  WorkflowApprovalDecisionHandler,
  WorkflowApprovalDecisions,
  WorkflowApprovalDecisionState,
} from "./approval/workflow-approval.js";

const AI_CHAT_STATUS_TO_WIDGET_STATUS: Readonly<Record<ChatStatus, WorkflowWidgetChatStatus>> = {
  error: WORKFLOW_WIDGET_CHAT_STATUS.ERROR,
  ready: WORKFLOW_WIDGET_CHAT_STATUS.IDLE,
  streaming: WORKFLOW_WIDGET_CHAT_STATUS.STREAMING,
  submitted: WORKFLOW_WIDGET_CHAT_STATUS.SUBMITTED,
};

const PENDING_INTERACTION_STATE = new Set([
  "approval-requested",
  "input-available",
  "input-streaming",
]);

export type WorkflowWidgetChat = Readonly<{
  approvalDecisions: WorkflowApprovalDecisions;
  cancelled: boolean;
  decideApproval: WorkflowApprovalDecisionHandler;
  error: WorkflowChatHttpError | undefined;
  messages: readonly WorkflowUIMessage[];
  status: WorkflowWidgetChatStatus;
  terminal: WorkflowChatTerminal;
  reconnect: () => Promise<void>;
  retry: () => Promise<void>;
  stop: () => void;
  submitMessage: (text: string) => Promise<void>;
}>;

export type WorkflowWidgetChatLifecycle = Readonly<{
  onRunAccepted?: ((runId: string) => void) | undefined;
  onRunTerminal?: ((runId: string) => void) | undefined;
}>;

/** One native AI SDK chat state machine for one open conversation. */
export function useWorkflowWidgetChat(
  client: WorkflowConversationClient,
  initialMessages: readonly WorkflowUIMessage[],
  hostBridge?: WidgetHostBridge,
  activeTurn?: WorkflowActiveTurn,
  lifecycle: WorkflowWidgetChatLifecycle = {},
  includeHostContext = false,
): WorkflowWidgetChat {
  const clientRef = useRef(client);
  clientRef.current = client;
  const hostBridgeRef = useRef<WidgetHostBridge | undefined>(hostBridge);
  hostBridgeRef.current = hostBridge;
  const lifecycleRef = useRef(lifecycle);
  lifecycleRef.current = lifecycle;
  const includeHostContextRef = useRef(includeHostContext);
  includeHostContextRef.current = includeHostContext;
  const latestMessagesRef = useRef<readonly WorkflowUIMessage[]>(initialMessages);
  const dispatchedToolCallIdsRef = useRef<Set<string>>(new Set());
  const approvalRequestsInFlightRef = useRef<Set<string>>(new Set());
  const activeRunIdRef = useRef<string | undefined>(undefined);
  const latestErrorRef = useRef<WorkflowChatHttpError | undefined>(undefined);
  const [cancelled, setCancelled] = useState(false);
  const [transportError, setTransportError] = useState<WorkflowChatHttpError | undefined>();
  const [terminal, setTerminal] = useState<WorkflowChatTerminal>({
    kind: "none",
  });
  const [approvalDecisions, setApprovalDecisions] = useState<WorkflowApprovalDecisions>({});
  const [transport] = useState(() =>
    createWidgetTransport(
      clientRef,
      activeRunIdRef,
      dispatchedToolCallIdsRef,
      hostBridgeRef,
      includeHostContextRef,
      lifecycleRef,
    ),
  );
  const onToolCall = createWorkflowClientToolCallHandler({
    activeRunIdRef,
    clientRef,
    dispatchedToolCallIdsRef,
    hostBridgeRef,
    latestMessagesRef,
  });
  const chat = useChat<WorkflowUIMessage>({
    id: client.conversationId,
    messages: [...initialMessages],
    messageMetadataSchema: sideChatMessageMetadataSchema,
    transport,
    onToolCall,
    onError: createWorkflowChatErrorHandler(latestErrorRef, setTransportError),
    onFinish: createWorkflowChatFinishHandler(
      latestErrorRef,
      setTerminal,
      (_nextTerminal, message, error) => {
        if (hasPendingInteraction(message) || error?.code === WORKFLOW_CHAT_TRANSPORT_ERROR_CODE) {
          return;
        }
        const runId = activeRunIdRef.current;
        if (runId) lifecycleRef.current.onRunTerminal?.(runId);
      },
    ),
  });
  latestMessagesRef.current = chat.messages;

  const reattachedRef = useRef(false);
  useEffect(() => {
    // On a cold load, seed the discovered run and resume its stream once. Replay
    // reconciles with the seeded history by message id, so no bubbles duplicate.
    if (reattachedRef.current || activeTurn === undefined) return;
    if (activeRunIdRef.current === activeTurn.runId) {
      reattachedRef.current = true;
      return;
    }
    reattachedRef.current = true;
    activeRunIdRef.current = activeTurn.runId;
    void chat.resumeStream();
  }, [activeTurn, chat]);

  const submitMessage = async (text: string): Promise<void> => {
    setCancelled(false);
    setTerminal({ kind: "none" });
    latestErrorRef.current = undefined;
    setTransportError(undefined);
    chat.clearError();
    await chat.sendMessage({ text });
  };

  const retry = async (): Promise<void> => {
    setCancelled(false);
    setTerminal({ kind: "none" });
    latestErrorRef.current = undefined;
    setTransportError(undefined);
    chat.clearError();
    await chat.regenerate();
  };

  const reconnect = async (): Promise<void> => {
    // Reattach to the interrupted run's stream after the transport gave up; the
    // run id is still held, so this resumes rather than starting a new turn.
    latestErrorRef.current = undefined;
    setTransportError(undefined);
    chat.clearError();
    await chat.resumeStream();
  };

  const stop = (): void => {
    const runId = activeRunIdRef.current;
    activeRunIdRef.current = undefined;
    void chat.stop();
    chat.clearError();
    latestErrorRef.current = undefined;
    setTransportError(undefined);
    setCancelled(true);
    if (runId) lifecycleRef.current.onRunTerminal?.(runId);
    if (runId) void cancelWorkflowChatRun(clientRef.current, runId).catch(() => undefined);
  };

  const decideApproval = createWorkflowApprovalDecisionHandler({
    activeRunIdRef,
    approvalRequestsInFlightRef,
    chat,
    clientRef,
    setApprovalDecisions,
  });

  return {
    approvalDecisions,
    cancelled,
    decideApproval,
    error: transportError,
    messages: chat.messages,
    status: toWidgetStatus(chat.status, transportError),
    terminal,
    reconnect,
    retry,
    stop,
    submitMessage,
  };
}

function createWidgetTransport(
  clientRef: { current: WorkflowConversationClient },
  activeRunIdRef: { current: string | undefined },
  dispatchedToolCallIdsRef: { current: Set<string> },
  hostBridgeRef: { current: WidgetHostBridge | undefined },
  includeHostContextRef: { current: boolean },
  lifecycleRef: { current: WorkflowWidgetChatLifecycle },
) {
  return createWorkflowChatTransport({
    getClient: () => clientRef.current,
    getClientTools: async () => {
      try {
        const capabilities = await hostBridgeRef.current?.getCapabilities?.();
        return capabilities ? toClientToolDefinitions(capabilities) : [];
      } catch {
        return [];
      }
    },
    getHostContext: async (request) => {
      if (!includeHostContextRef.current) return undefined;
      const getContext = hostBridgeRef.current?.getContext;
      return getContext ? getContext(request) : undefined;
    },
    getReconnectRunId: () => activeRunIdRef.current,
    // Keep the last run id available after the stream closes: approvals and
    // result-before-hook retries are interaction continuations of that run.
    onRunFinished: () => undefined,
    onRunStarted: (runId) => {
      if (activeRunIdRef.current !== runId) dispatchedToolCallIdsRef.current.clear();
      activeRunIdRef.current = runId;
      lifecycleRef.current.onRunAccepted?.(runId);
    },
  });
}

const toWidgetStatus = (
  status: ChatStatus,
  error: WorkflowChatHttpError | undefined,
): WorkflowWidgetChatStatus =>
  error ? WORKFLOW_WIDGET_CHAT_STATUS.ERROR : AI_CHAT_STATUS_TO_WIDGET_STATUS[status];

function hasPendingInteraction(message: WorkflowUIMessage): boolean {
  return message.parts.some((part) => {
    const state = readInteractionState(part);
    return state !== undefined && PENDING_INTERACTION_STATE.has(state);
  });
}

function readInteractionState(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const state = value["state"];
  return typeof state === "string" ? state : undefined;
}
