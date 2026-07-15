import {
  TURN_ACTIVITY_EVENT_TYPE,
  TURN_ACTIVITY_SYNC_EVENT_TYPE,
  type TurnActivityEvent,
  type TurnActivityStreamEvent,
  type TurnActivitySyncEvent,
} from "@side-chat/chat-protocol";

import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import type { TurnActivityNotification } from "#application/ports/turn/activity/turn-activity-source";
import type { AuthContext } from "#domain/auth-context";
import type { ActivitySubscription, TurnActivityDispatcher } from "./turn-activity-dispatcher.js";

const TERMINAL_ACTIVITY_STATUS = "terminal";

/**
 * Register before reading the synchronization snapshot, then verify every
 * identity-only invalidation against the Workflow-backed active-turn join.
 */
export function createActivitySubscriptionStream(
  dispatcher: TurnActivityDispatcher,
  queries: Pick<ConversationQueryStore, "listActiveTurns">,
  auth: AuthContext,
): ReadableStream<TurnActivityStreamEvent> {
  let subscription: ActivitySubscription | undefined;
  let eventReader: ReadableStreamDefaultReader<TurnActivityNotification> | undefined;
  let cancelled = false;

  const release = async (): Promise<void> => {
    cancelled = true;
    await eventReader?.cancel();
    await subscription?.release();
  };

  return new ReadableStream<TurnActivityStreamEvent>({
    start: (controller) => {
      void pumpActivityEvents(controller).catch((error: unknown) => {
        if (cancelled) return;
        controller.error(error);
        void release().catch(() => undefined);
      });
    },
    cancel: release,
  });

  async function pumpActivityEvents(
    controller: ReadableStreamDefaultController<TurnActivityStreamEvent>,
  ): Promise<void> {
    subscription = await dispatcher.subscribe({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
    });
    if (cancelled) {
      await subscription.release();
      return;
    }

    controller.enqueue(await readSnapshot(queries, auth));
    eventReader = subscription.events.getReader();
    while (!cancelled) {
      const next = await eventReader.read();
      if (next.done) break;
      const event = await resolveActivityEvent(queries, auth, next.value);
      if (event) controller.enqueue(event);
    }
    if (!cancelled) controller.close();
    await release();
  }
}

const readSnapshot = async (
  queries: Pick<ConversationQueryStore, "listActiveTurns">,
  auth: AuthContext,
): Promise<TurnActivitySyncEvent> => {
  const turns = await queries.listActiveTurns(auth);
  return {
    type: TURN_ACTIVITY_SYNC_EVENT_TYPE,
    activeTurns: turns.map((turn) => ({
      conversationId: turn.conversationId,
      assistantTurnId: turn.turnId,
    })),
  };
};

async function resolveActivityEvent(
  queries: Pick<ConversationQueryStore, "listActiveTurns">,
  auth: AuthContext,
  notification: TurnActivityNotification,
): Promise<TurnActivityEvent | undefined> {
  try {
    const activeTurns = await queries.listActiveTurns(auth);
    const isRunning = activeTurns.some(
      (turn) =>
        turn.conversationId === notification.conversationId &&
        turn.turnId === notification.assistantTurnId,
    );
    return {
      type: TURN_ACTIVITY_EVENT_TYPE,
      conversationId: notification.conversationId,
      assistantTurnId: notification.assistantTurnId,
      status: isRunning ? "running" : TERMINAL_ACTIVITY_STATUS,
    };
  } catch {
    // A notification is only an invalidation hint. If durable state cannot be
    // read, emit no status claim; reconnect synchronization remains authoritative.
    return undefined;
  }
}
