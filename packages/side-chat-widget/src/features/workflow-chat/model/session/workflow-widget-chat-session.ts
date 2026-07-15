import type {
  WorkflowWidgetChatSession,
  WorkflowWidgetChatSessionContext,
  WorkflowWidgetChatSessionRegistry,
} from "./workflow-widget-chat-session-contract.js";
import { createWorkflowWidgetChatSession } from "./workflow-widget-chat-session-runtime.js";

export type {
  WorkflowWidgetChatLifecycle,
  WorkflowWidgetChatSessionRegistry,
} from "./workflow-widget-chat-session-contract.js";
export {
  WORKFLOW_WIDGET_TRANSPORT,
  WORKFLOW_WIDGET_TURN,
} from "./reducer/workflow-widget-chat-reducer.js";
export type {
  WorkflowWidgetTransport,
  WorkflowWidgetTurn,
} from "./reducer/workflow-widget-chat-reducer.js";

/**
 * Widget-lifetime owner of native chat state.
 *
 * React selects which session to observe; it does not own the request. A session
 * therefore survives conversation switches and panel close/reopen, while idle
 * offscreen sessions can be discarded and reconstructed from durable history.
 */
export function createWorkflowWidgetChatSessionRegistry(): WorkflowWidgetChatSessionRegistry {
  const sessions = new Map<string, WorkflowWidgetChatSession>();

  function getOrCreate(context: WorkflowWidgetChatSessionContext): WorkflowWidgetChatSession {
    const existing = sessions.get(context.client.conversationId);
    if (existing) return existing;
    const created = createWorkflowWidgetChatSession(context);
    sessions.set(context.client.conversationId, created);
    return created;
  }

  function pruneIdleExcept(conversationId: string): void {
    for (const [candidateId, session] of sessions) {
      if (candidateId === conversationId || !session.canPrune()) continue;
      session.dispose();
      sessions.delete(candidateId);
    }
  }

  function disposeAll(): void {
    for (const session of sessions.values()) session.dispose();
    sessions.clear();
  }

  return {
    disposeAll,
    getOrCreate,
    has: (conversationId) => sessions.has(conversationId),
    pruneIdleExcept,
  };
}
