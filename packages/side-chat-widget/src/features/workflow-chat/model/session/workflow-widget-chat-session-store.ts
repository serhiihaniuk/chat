import type { WorkflowActiveTurn, WorkflowUIMessage } from "#entities/workflow-chat";
import type { WorkflowWidgetChatSessionSnapshot } from "./workflow-widget-chat-session-contract.js";
import {
  createWorkflowWidgetChatState,
  workflowWidgetChatReducer,
  type WorkflowWidgetChatEvent,
} from "./reducer/workflow-widget-chat-reducer.js";

export type WorkflowWidgetChatSessionStore = Readonly<{
  dispatch: (event: WorkflowWidgetChatEvent) => void;
  getSnapshot: () => WorkflowWidgetChatSessionSnapshot;
  subscribe: (listener: () => void) => () => void;
}>;

/** Reducer-only external store for one conversation aggregate. */
export function createWorkflowWidgetChatSessionStore(
  initialMessages: readonly WorkflowUIMessage[],
  activeTurn?: WorkflowActiveTurn,
  observationId?: string,
): WorkflowWidgetChatSessionStore {
  return new WorkflowWidgetChatExternalStore(initialMessages, activeTurn, observationId);
}

class WorkflowWidgetChatExternalStore implements WorkflowWidgetChatSessionStore {
  private readonly listeners = new Set<() => void>();
  private snapshot: WorkflowWidgetChatSessionSnapshot;

  constructor(
    initialMessages: readonly WorkflowUIMessage[],
    activeTurn: WorkflowActiveTurn | undefined,
    observationId: string | undefined,
  ) {
    this.snapshot = createWorkflowWidgetChatState(initialMessages, activeTurn, observationId);
  }

  readonly getSnapshot = (): WorkflowWidgetChatSessionSnapshot => this.snapshot;

  readonly dispatch = (event: WorkflowWidgetChatEvent): void => {
    const next = workflowWidgetChatReducer(this.snapshot, event);
    if (next === this.snapshot) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  };

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}
