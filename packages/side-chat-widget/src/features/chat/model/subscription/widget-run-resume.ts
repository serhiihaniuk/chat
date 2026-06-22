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
 * Resolve which turn to resume and from where, using the in-memory run.
 *
 * The live run has the freshest `lastSeenSequence`, so resume tails from there. A
 * run that is already terminal, or has no turn id yet, is not resumed; a cold
 * reload with an empty store is handled by `resumeRunFromMarker` instead.
 */
export const resumeTarget = (store: WidgetRunStore): SubscribeTarget | undefined => {
  const run = store.getSnapshot();
  if (!run || !isResumableRun(run) || !run.assistantTurnId) return undefined;
  return {
    requestId: run.requestId,
    assistantTurnId: run.assistantTurnId,
    conversationId: run.conversationId,
    after: run.lastSeenSequence,
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
 * The marker holds only identity, so the view is rebuilt: a turn that already
 * finished server-side is left to history (resuming it would duplicate the
 * bubble), otherwise conversation history (the prompt + prior turns) is loaded,
 * the run is seeded with it plus a fresh pending assistant bubble, and the durable
 * log is replayed from the start (after = -1) so the in-flight answer streams back
 * into that bubble. The store-empty re-checks guard against a concurrent reconnect
 * seeding first.
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
    context.refreshHistory(marker.conversationId);
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
    after: -1,
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
