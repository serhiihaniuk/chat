import type { WidgetHostBridge } from "@side-chat/host-bridge";

import type {
  WorkflowActiveTurn,
  WorkflowConversationClient,
  WorkflowUIMessage,
} from "#entities/workflow-chat";
import type { WorkflowApprovalDecisionHandler } from "../approval/workflow-approval.js";
import type { WorkflowWidgetChatState } from "./reducer/workflow-widget-chat-reducer.js";

export type WorkflowWidgetChatLifecycle = Readonly<{
  onRunAccepted?: ((runId: string, clientToolCapability: string) => void) | undefined;
  onRunReconciled?: ((runId: string) => void) | undefined;
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
  has: (conversationId: string) => boolean;
  pruneIdleExcept: (conversationId: string) => void;
  reconcileInactiveConversation: (conversationId: string) => Promise<void>;
}>;
