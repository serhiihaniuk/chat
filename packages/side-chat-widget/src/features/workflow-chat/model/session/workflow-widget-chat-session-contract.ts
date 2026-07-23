import type { WidgetHostBridge } from "@side-chat/host-bridge";

import type {
  WorkflowActiveTurn,
  WorkflowConversationClient,
  WorkflowUIMessage,
} from "#entities/workflow-chat";
import type { WorkflowApprovalDecisionHandler } from "../approval/workflow-approval.js";
import type { WorkflowWidgetChatState } from "./reducer/workflow-widget-chat-reducer.js";

export type WorkflowWidgetChatLifecycle = Readonly<{
  /** The send response exposed a durable run and its same-tab client-tool authority. */
  onRunAccepted?: ((runId: string, clientToolCapability: string) => void) | undefined;
  /** A newer authoritative snapshot no longer reports this run as active. */
  onRunReconciled?: ((runId: string) => void) | undefined;
  /** The attached stream reached a terminal with no pending browser interaction. */
  onRunTerminal?: ((runId: string) => void) | undefined;
}>;

export type WorkflowWidgetChatSessionSnapshot = WorkflowWidgetChatState;

export type WorkflowWidgetChatSessionContext = Readonly<{
  activeTurn?: WorkflowActiveTurn | undefined;
  client: WorkflowConversationClient;
  clientToolCapability?: string | undefined;
  hostBridge?: WidgetHostBridge | undefined;
  includeHostContext: boolean;
  initialMessages: readonly WorkflowUIMessage[];
  lifecycle: WorkflowWidgetChatLifecycle;
  stateObservationId?: string | undefined;
}>;

export type WorkflowWidgetChatSession = Readonly<{
  canPrune: () => boolean;
  decideApproval: WorkflowApprovalDecisionHandler;
  dispose: () => void;
  getSnapshot: () => WorkflowWidgetChatSessionSnapshot;
  observeSnapshot: (
    messages: readonly WorkflowUIMessage[],
    activeTurn: WorkflowActiveTurn | undefined,
    stateObservationId: string | undefined,
  ) => void;
  reconnect: () => Promise<void>;
  retry: () => Promise<void>;
  stop: () => void;
  submitMessage: (text: string) => Promise<void>;
  subscribe: (listener: () => void) => () => void;
  updateContext: (context: Omit<WorkflowWidgetChatSessionContext, "initialMessages">) => void;
}>;

export type WorkflowWidgetChatSessionRegistry = Readonly<{
  disposeAll: () => void;
  getOrCreate: (context: WorkflowWidgetChatSessionContext) => WorkflowWidgetChatSession;
  has: (client: WorkflowConversationClient) => boolean;
  pruneIdleExcept: (client: WorkflowConversationClient) => void;
  reconcileInactiveConversation: (client: WorkflowConversationClient) => Promise<void>;
}>;
