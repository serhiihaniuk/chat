import { TURN_ACTIVITY_EVENT_TYPE } from "@side-chat/chat-protocol";
import { Effect, Queue, Stream } from "effect";
import { describe, expect, it } from "vitest";

import type { TurnActivityNotification } from "#application/ports/turn/activity/turn-activity-source";
import { createTurnActivityDispatcher } from "./turn-activity-dispatcher.js";

describe("createTurnActivityDispatcher", () => {
  it("fans a lifecycle signal out only to its authenticated subject", async () => {
    const source = Effect.runSync(Queue.unbounded<TurnActivityNotification>());
    const dispatcher = createTurnActivityDispatcher({ notifications: Stream.fromQueue(source) });
    const alice = await dispatcher.subscribe({ workspaceId: "workspace-1", subjectId: "alice" });
    const bob = await dispatcher.subscribe({ workspaceId: "workspace-1", subjectId: "bob" });

    await Effect.runPromise(Queue.offer(source, notification("alice", "conversation-a")));
    await Effect.runPromise(Queue.offer(source, notification("bob", "conversation-b")));

    await expect(Effect.runPromise(Queue.take(alice.events))).resolves.toEqual({
      type: TURN_ACTIVITY_EVENT_TYPE,
      conversationId: "conversation-a",
      assistantTurnId: "turn-conversation-a",
      status: "running",
    });
    await expect(Effect.runPromise(Queue.take(bob.events))).resolves.toMatchObject({
      conversationId: "conversation-b",
    });
    await dispatcher.shutdown();
  });
});

function notification(subjectId: string, conversationId: string): TurnActivityNotification {
  return {
    workspaceId: "workspace-1",
    subjectId,
    conversationId,
    assistantTurnId: `turn-${conversationId}`,
    status: "running",
  };
}
