import {
  createId,
  createWidgetMessage,
  findLastUserMessage,
  type WidgetMessage,
} from "#entities/chat";
import type { SideChatApiClient } from "#entities/conversation";
import { toWidgetHistoryMessages } from "../conversation/widget-conversations.js";
import { WIDGET_RUN_STATUSES, type WidgetRunState } from "../run/widget-run-state.js";
import type { WidgetRunStore } from "../run/widget-run-store.js";
import { clearActiveRunMarker, readActiveRunMarker } from "../reconnect/widget-run-marker.js";
import type { RunLifecycleContext, SubscribeTarget } from "./widget-subscription-lifecycle.js";

/**
 * Resolve which turn to resume, using the in-memory run.
 *
 * The resume cursor is not threaded through: transport recovery reads the run's
 * `lastSeenSequence` from the store per attempt. A run that is already terminal,
 * or has no turn id yet, is not resumed; a cold reload with an empty store is
 * handled by `resumeRunFromMarker` instead.
 */
export const resumeTarget = (store: WidgetRunStore): SubscribeTarget | undefined => {
  const run = store.getSnapshot();
  if (!run || !isResumableRun(run) || !run.assistantTurnId) return undefined;
  return {
    requestId: run.requestId,
    assistantTurnId: run.assistantTurnId,
    conversationId: run.conversationId,
    resuming: true,
  };
};

const isResumableRun = (run: WidgetRunState): boolean =>
  run.status === WIDGET_RUN_STATUSES.STREAMING ||
  run.status === WIDGET_RUN_STATUSES.SUBMITTED ||
  run.status === WIDGET_RUN_STATUSES.RECONNECTING;

/**
 * Resume a run after a full reload, when the in-memory store is empty.
 *
 * The marker stores only the turn identity, so the view must be rebuilt. If the
 * turn already finished, history is enough; replaying it would duplicate the
 * assistant bubble. If it is still running, load history, add a pending bubble,
 * and replay the buffered events from the start (`after = -1`).
 *
 * The store checks before each seed prevent two reconnects from creating two
 * local runs.
 */
export const resumeRunFromMarker = async (
  context: RunLifecycleContext,
  store: WidgetRunStore,
  subscribe: (target: SubscribeTarget) => void,
): Promise<void> => {
  const marker = readActiveRunMarker(context.conversationStorageKey);
  if (!marker?.assistantTurnId || store.getSnapshot()) return;
  const assistantTurnId = marker.assistantTurnId;

  const status = await readTurnStatus(context.client, assistantTurnId);
  if (status && status !== "running") {
    // The turn finished while we were away, so resuming would duplicate the
    // bubble. History shows it instead — but the cached transcript may have been
    // fetched mid-flight (before the assistant message committed), so refetch it.
    // The terminal status guarantees the final message is now committed.
    clearActiveRunMarker(context.conversationStorageKey);
    void context.refreshHistory(marker.conversationId);
    return;
  }
  if (store.getSnapshot()) return;

  const seedMessages = await loadResumeHistory(context.client, marker.conversationId);
  if (store.getSnapshot()) return;

  const localAssistantMessageId = createId("assistant");
  store.start({
    requestId: marker.requestId,
    assistantTurnId,
    conversationId: marker.conversationId,
    localUserMessageId: findLastUserMessage(seedMessages)?.id ?? createId("user"),
    localAssistantMessageId,
    messages: [
      ...seedMessages,
      createWidgetMessage(localAssistantMessageId, "assistant", "", true),
    ],
    status: WIDGET_RUN_STATUSES.RECONNECTING,
  });

  subscribe({
    requestId: marker.requestId,
    assistantTurnId,
    conversationId: marker.conversationId,
    resuming: true,
  });
};

// A missing/unknown turn or transport error reads as "no status", so resume is
// attempted (the subscribe surfaces any real failure) rather than blocked.
const readTurnStatus = async (
  client: SideChatApiClient,
  assistantTurnId: string,
): Promise<string | undefined> => {
  if (!client.getTurnStatus) return undefined;
  try {
    return (await client.getTurnStatus(assistantTurnId, {})).status;
  } catch {
    return undefined;
  }
};

const loadResumeHistory = async (
  client: SideChatApiClient,
  conversationId: string | undefined,
): Promise<readonly WidgetMessage[]> => {
  if (!client.readHistory || !conversationId) return [];
  try {
    return [...toWidgetHistoryMessages(await client.readHistory(conversationId, {}))];
  } catch {
    return [];
  }
};

export type ResumeFromActiveTurnInput = {
  readonly conversationId: string | undefined;
  readonly assistantTurnId: string;
  readonly seedMessages: readonly WidgetMessage[];
};

/**
 * Resume the running turn reported by a history read.
 *
 * This path does not need the browser's run marker. The server says the turn is
 * still running, so it also works on a new device or when the marker is stale.
 * Seed the loaded transcript with a pending assistant bubble, then replay the
 * stream from the beginning (`after = -1`). `activeTurn` exists only while the
 * turn is running, so history cannot already contain a second answer.
 */
export const resumeFromActiveTurn = (
  store: WidgetRunStore,
  subscribe: (target: SubscribeTarget) => void,
  input: ResumeFromActiveTurnInput,
): void => {
  const localAssistantMessageId = createId("assistant");
  // The marker-less path has no client request id; key the run by its turn so the
  // subscription's dispatches match and a per-turn marker can be (re)written.
  const requestId = `resume_${input.assistantTurnId}`;
  store.start({
    requestId,
    assistantTurnId: input.assistantTurnId,
    conversationId: input.conversationId,
    localUserMessageId: findLastUserMessage(input.seedMessages)?.id ?? createId("user"),
    localAssistantMessageId,
    messages: [
      ...input.seedMessages,
      createWidgetMessage(localAssistantMessageId, "assistant", "", true),
    ],
    status: WIDGET_RUN_STATUSES.RECONNECTING,
  });

  subscribe({
    requestId,
    assistantTurnId: input.assistantTurnId,
    conversationId: input.conversationId,
    resuming: true,
  });
};
