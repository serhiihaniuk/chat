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
    const key = sessionKey(context.client);
    const existing = sessions.get(key);
    if (existing) return existing;
    const created = createWorkflowWidgetChatSession(context);
    sessions.set(key, created);
    return created;
  }

  function pruneIdleExcept(client: WorkflowWidgetChatSessionContext["client"]): void {
    const activeKey = sessionKey(client);
    for (const [candidateKey, session] of sessions) {
      if (candidateKey === activeKey || !session.canPrune()) continue;
      session.dispose();
      sessions.delete(candidateKey);
    }
  }

  async function reconcileInactiveConversation(
    client: WorkflowWidgetChatSessionContext["client"],
  ): Promise<void> {
    const key = sessionKey(client);
    const session = sessions.get(key);
    if (!session) return;
    await session.reconnect();
    if (!session.canPrune()) return;
    session.dispose();
    sessions.delete(key);
  }

  function disposeAll(): void {
    for (const session of sessions.values()) session.dispose();
    sessions.clear();
  }

  return {
    disposeAll,
    getOrCreate,
    has: (client) => sessions.has(sessionKey(client)),
    pruneIdleExcept,
    reconcileInactiveConversation,
  };
}

function sessionKey(client: WorkflowWidgetChatSessionContext["client"]): string {
  return JSON.stringify([
    client.baseUrl.replace(/\/$/u, ""),
    client.scopeKey,
    client.conversationId,
  ]);
}
