import {
  normalizeWorkflowChatError,
  readWorkflowConversationState,
  type WorkflowActiveTurn,
  type WorkflowUIMessage,
} from "#entities/workflow-chat";
import { readWorkflowClientToolCalls } from "../client-tools/workflow-client-tool-callback.js";
import {
  createWorkflowWidgetChatEngine,
  type WorkflowWidgetChatAttachmentMode,
  type WorkflowWidgetChatStreamEnd,
} from "./engine/workflow-widget-chat-engine.js";
import type { WorkflowWidgetChatEvent } from "./reducer/workflow-widget-chat-reducer.js";
import {
  decideWorkflowWidgetApproval,
  dispatchWorkflowWidgetClientTool,
  requestWorkflowWidgetCancellation,
  type WorkflowWidgetChatSessionEffectContext,
} from "./runtime/workflow-widget-chat-session-effects.js";
import {
  findLastWorkflowAssistantIndex,
  hasPendingWorkflowInteraction,
  toWorkflowWidgetChatRuntimeContext,
  workflowWidgetChatSnapshotKey,
  type WorkflowWidgetAttachmentEpoch,
  type WorkflowWidgetChatRuntimeContext,
} from "./runtime/workflow-widget-chat-session-helpers.js";
import { shouldKeepWorkflowWidgetEpoch } from "./runtime/workflow-widget-chat-snapshot-policy.js";
import type {
  WorkflowWidgetChatSession,
  WorkflowWidgetChatSessionContext,
  WorkflowWidgetChatSessionSnapshot,
} from "./workflow-widget-chat-session-contract.js";
import {
  createWorkflowWidgetChatSessionStore,
  type WorkflowWidgetChatSessionStore,
} from "./workflow-widget-chat-session-store.js";

/** Build the sole state and attachment authority for one conversation. */
export function createWorkflowWidgetChatSession(
  context: WorkflowWidgetChatSessionContext,
): WorkflowWidgetChatSession {
  return new WorkflowWidgetConversationSession(context);
}

class WorkflowWidgetConversationSession implements WorkflowWidgetChatSession {
  private readonly store: WorkflowWidgetChatSessionStore;
  private context: WorkflowWidgetChatRuntimeContext;
  private currentEpoch: WorkflowWidgetAttachmentEpoch | undefined;
  private disposed = false;
  private lastSnapshotKey: string | undefined;
  private nextEpoch = 0;
  private terminalNotificationRunId: string | undefined;

  constructor(context: WorkflowWidgetChatSessionContext) {
    this.context = toWorkflowWidgetChatRuntimeContext(context);
    this.store = createWorkflowWidgetChatSessionStore(
      context.initialMessages,
      context.activeTurn,
      context.stateObservationId,
    );
  }

  readonly canPrune = (): boolean => {
    const snapshot = this.store.getSnapshot();
    return snapshot.activeRunId === undefined && snapshot.activeEpoch === undefined;
  };

  readonly decideApproval = async (approvalId: string, approved: boolean): Promise<void> => {
    await decideWorkflowWidgetApproval(this.effectContext(), { approvalId, approved });
  };

  readonly dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeEpoch();
  };

  readonly getSnapshot = (): WorkflowWidgetChatSessionSnapshot => this.store.getSnapshot();

  readonly observeSnapshot = (
    messages: readonly WorkflowUIMessage[],
    activeTurn: WorkflowActiveTurn | undefined,
    stateObservationId: string | undefined,
  ): void => {
    if (this.disposed) return;
    const key = workflowWidgetChatSnapshotKey(messages, activeTurn, stateObservationId);
    if (this.lastSnapshotKey === key) return;
    this.lastSnapshotKey = key;
    const previous = this.store.getSnapshot();
    const previousRunId = previous.activeRunId;
    const keepCurrentEpoch = shouldKeepWorkflowWidgetEpoch(activeTurn, previous);
    if (!keepCurrentEpoch) this.disposeEpoch();
    this.dispatch({
      type: "SnapshotLoaded",
      activeTurn,
      messages,
      observationId: stateObservationId,
    });
    if (previousRunId && previousRunId !== activeTurn?.runId) {
      this.terminalNotificationRunId = undefined;
      this.context.lifecycle.onRunReconciled?.(previousRunId);
    }
    if (activeTurn && !keepCurrentEpoch) {
      this.terminalNotificationRunId = undefined;
      void this.startEpoch({ kind: "reconnect", runId: activeTurn.runId });
    }
    if (activeTurn) requestWorkflowWidgetCancellation(this.effectContext(), activeTurn.runId);
  };

  readonly reconnect = async (): Promise<void> => {
    if (this.disposed) return;
    try {
      const snapshot = await readWorkflowConversationState(this.context.client);
      this.observeSnapshot(
        snapshot.messages,
        snapshot.activeTurn,
        `manual-reconnect:${crypto.randomUUID()}`,
      );
    } catch (error) {
      const epochId = this.currentEpoch?.epochId;
      if (epochId) {
        this.dispatch({
          type: "TransportDropped",
          epochId,
          error: normalizeWorkflowChatError(error),
        });
      }
    }
  };

  readonly retry = async (): Promise<void> => {
    if (this.disposed) return;
    const snapshot = this.store.getSnapshot();
    if (snapshot.activeRunId) {
      await this.reconnect();
      return;
    }
    const assistantIndex = findLastWorkflowAssistantIndex(snapshot.messages);
    if (assistantIndex < 0) return;
    const assistantMessageId = snapshot.messages[assistantIndex]?.id;
    const messages = snapshot.messages.slice(0, assistantIndex);
    this.dispatch({ type: "RetryStarted", messages });
    await this.startEpoch({
      kind: "send",
      messageId: assistantMessageId,
      trigger: "regenerate-message",
    });
  };

  readonly stop = (): void => {
    const snapshot = this.store.getSnapshot();
    if (this.disposed || !snapshot.activeEpoch || snapshot.terminal.kind !== "none") return;
    const runId = snapshot.activeRunId;
    this.dispatch({ type: "CancelRequested", runId });
    if (runId) requestWorkflowWidgetCancellation(this.effectContext(), runId);
  };

  readonly submitMessage = async (text: string): Promise<void> => {
    if (this.disposed || this.store.getSnapshot().activeRunId) return;
    const message: WorkflowUIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    };
    this.dispatch({ type: "OptimisticMessageAdded", message });
    await this.startEpoch({
      kind: "send",
      messageId: message.id,
      trigger: "submit-message",
    });
  };

  readonly subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener);

  readonly updateContext = (context: WorkflowWidgetChatRuntimeContext): void => {
    this.context = context;
  };

  private readonly dispatch = (event: WorkflowWidgetChatEvent): void => {
    if (!this.disposed) this.store.dispatch(event);
  };

  private effectContext(): WorkflowWidgetChatSessionEffectContext {
    return {
      client: this.context.client,
      dispatch: this.dispatch,
      hostBridge: this.context.hostBridge,
      isDisposed: () => this.disposed,
      isEpochActive: () => this.currentEpoch !== undefined,
      readSnapshot: this.store.getSnapshot,
      reconnect: (runId) => void this.startEpoch({ kind: "reconnect", runId }),
    };
  }

  private startEpoch(mode: WorkflowWidgetChatAttachmentMode): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.disposeEpoch();
    const epochId = `workflow-epoch-${String(++this.nextEpoch)}`;
    const engine = createWorkflowWidgetChatEngine({
      client: this.context.client,
      hostBridge: this.context.hostBridge,
      includeHostContext: this.context.includeHostContext,
      messages: this.store.getSnapshot().messages,
      mode,
      onMessage: this.acceptMessage.bind(this, epochId),
      onRunAccepted: this.acceptRun.bind(this, epochId),
      onStreamEnded: this.endStream.bind(this, epochId),
      onTransportDropped: this.dropTransport.bind(this, epochId),
      onTransportRecovered: this.recoverTransport.bind(this, epochId),
    });
    this.currentEpoch = {
      engine,
      epochId,
      runId: mode.kind === "reconnect" ? mode.runId : undefined,
    };
    this.dispatch({
      type: "AttachmentStarted",
      epochId,
      reconnecting: mode.kind === "reconnect",
      runId: this.currentEpoch.runId,
    });
    return engine.start();
  }

  private acceptMessage(epochId: string, message: WorkflowUIMessage): void {
    if (!this.isCurrentEpoch(epochId)) return;
    this.dispatch({ type: "PartReceived", epochId, message });
    for (const toolCall of readWorkflowClientToolCalls(message)) {
      void dispatchWorkflowWidgetClientTool(this.effectContext(), toolCall);
    }
  }

  private acceptRun(epochId: string, runId: string): void {
    const epoch = this.currentEpoch;
    if (this.disposed || epoch?.epochId !== epochId) return;
    epoch.runId = runId;
    this.terminalNotificationRunId = undefined;
    this.dispatch({ type: "RunAccepted", epochId, runId });
    this.context.lifecycle.onRunAccepted?.(runId);
    requestWorkflowWidgetCancellation(this.effectContext(), runId);
  }

  private endStream(epochId: string, end: WorkflowWidgetChatStreamEnd): void {
    if (!this.isCurrentEpoch(epochId)) return;
    this.dispatch({ type: "StreamEnded", epochId, ...end });
    const runId = this.store.getSnapshot().activeRunId;
    const hasPending = hasPendingWorkflowInteraction(this.store.getSnapshot());
    this.disposeEpoch();
    if (runId && !hasPending) this.notifyRunTerminal(runId);
  }

  private dropTransport(epochId: string, error: unknown): void {
    if (!this.isCurrentEpoch(epochId)) return;
    this.dispatch({
      type: "TransportDropped",
      epochId,
      error: normalizeWorkflowChatError(error),
    });
  }

  private recoverTransport(epochId: string): void {
    this.dispatch({ type: "TransportRecovered", epochId });
  }

  private disposeEpoch(): void {
    const epoch = this.currentEpoch;
    if (!epoch) return;
    this.currentEpoch = undefined;
    epoch.engine.dispose();
    this.dispatch({ type: "EpochDisposed", epochId: epoch.epochId });
  }

  private isCurrentEpoch(epochId: string): boolean {
    return !this.disposed && this.currentEpoch?.epochId === epochId;
  }

  private notifyRunTerminal(runId: string): void {
    if (this.terminalNotificationRunId === runId || this.disposed) return;
    this.terminalNotificationRunId = runId;
    this.context.lifecycle.onRunTerminal?.(runId);
  }
}
