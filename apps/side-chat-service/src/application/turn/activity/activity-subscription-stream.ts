import {
  TURN_ACTIVITY_KIND,
  type TurnActivity,
  type TurnActivitySnapshot,
  type TurnActivityTransition,
} from "#domain/turn-activity";

import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import type { TurnActivityNotification } from "#application/ports/turn/activity/turn-activity-source";
import type { AuthContext } from "@side-chat/side-chat-server";
import type { ActivitySubscription, TurnActivityDispatcher } from "./turn-activity-dispatcher.js";

/**
 * Register before reading the synchronization snapshot, then verify every
 * identity-only invalidation against the Workflow-backed active-turn join.
 */
export function createActivitySubscriptionStream(
  dispatcher: TurnActivityDispatcher,
  queries: Pick<ConversationQueryStore, "listActiveTurns">,
  auth: AuthContext,
): ReadableStream<TurnActivity> {
  let subscription: ActivitySubscription | undefined;
  let eventReader: ReadableStreamDefaultReader<TurnActivityNotification> | undefined;
  let cancelled = false;

  const release = async (): Promise<void> => {
    cancelled = true;
    await eventReader?.cancel();
    await subscription?.release();
  };

  return new ReadableStream<TurnActivity>({
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
    controller: ReadableStreamDefaultController<TurnActivity>,
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
): Promise<TurnActivitySnapshot> => {
  const turns = await queries.listActiveTurns(auth);
  return {
    kind: TURN_ACTIVITY_KIND.SNAPSHOT,
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
): Promise<TurnActivityTransition | undefined> {
  try {
    const activeTurns = await queries.listActiveTurns(auth);
    const isRunning = activeTurns.some(
      (turn) =>
        turn.conversationId === notification.conversationId &&
        turn.turnId === notification.assistantTurnId,
    );
    return {
      kind: TURN_ACTIVITY_KIND.TRANSITION,
      conversationId: notification.conversationId,
      assistantTurnId: notification.assistantTurnId,
      running: isRunning,
    };
  } catch {
    // A notification is only an invalidation hint. If durable state cannot be
    // read, emit no status claim; reconnect synchronization remains authoritative.
    return undefined;
  }
}
