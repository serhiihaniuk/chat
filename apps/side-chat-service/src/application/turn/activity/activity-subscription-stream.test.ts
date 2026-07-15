import { Effect, Queue, Stream } from "effect";
import { describe, expect, it } from "vitest";

import type { TurnActivityNotification } from "#application/ports/turn/activity/turn-activity-source";
import type { AuthContext } from "#domain/auth-context";
import { createActivitySubscriptionStream } from "./activity-subscription-stream.js";
import { createTurnActivityDispatcher } from "./turn-activity-dispatcher.js";

const auth: AuthContext = {
  workspaceId: "workspace-1",
  subjectId: "subject-1",
  issuedAt: "2026-07-14T00:00:00.000Z",
};

describe("createActivitySubscriptionStream", () => {
  it("registers before the active-turn snapshot and then appends live changes", async () => {
    const source = Effect.runSync(Queue.unbounded<TurnActivityNotification>());
    const dispatcher = createTurnActivityDispatcher({ notifications: Stream.fromQueue(source) });
    const events = createActivitySubscriptionStream(
      dispatcher,
      {
        listActiveTurns: async (receivedAuth) => {
          expect(receivedAuth).toEqual(auth);
          await Effect.runPromise(
            Queue.offer(source, {
              workspaceId: auth.workspaceId,
              subjectId: auth.subjectId,
              conversationId: "conversation-live",
              assistantTurnId: "turn-live",
              status: "completed",
            }),
          );
          return [
            {
              conversationId: "conversation-snapshot",
              turnId: "turn-snapshot",
              runId: "run-snapshot",
              status: "running" as const,
            },
          ];
        },
      },
      auth,
    );

    const received = await Effect.runPromise(events.pipe(Stream.take(2), Stream.runCollect));
    expect(Array.from(received)).toMatchObject([
      {
        type: "sidechat.turn-activity-sync",
        activeTurns: [
          { conversationId: "conversation-snapshot", assistantTurnId: "turn-snapshot" },
        ],
      },
      { conversationId: "conversation-live", status: "completed" },
    ]);
    await dispatcher.shutdown();
  });

  it("emits a synchronization barrier when no turn is running", async () => {
    const source = Effect.runSync(Queue.unbounded<TurnActivityNotification>());
    const dispatcher = createTurnActivityDispatcher({ notifications: Stream.fromQueue(source) });
    const events = createActivitySubscriptionStream(
      dispatcher,
      { listActiveTurns: () => Promise.resolve([]) },
      auth,
    );

    const received = await Effect.runPromise(events.pipe(Stream.take(1), Stream.runCollect));

    expect(Array.from(received)).toEqual([
      { type: "sidechat.turn-activity-sync", activeTurns: [] },
    ]);
    await dispatcher.shutdown();
  });
});
