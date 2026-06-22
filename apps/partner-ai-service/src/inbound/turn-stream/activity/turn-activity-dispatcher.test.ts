import type { TurnActivityNotification } from "@side-chat/db";
import { TURN_ACTIVITY_EVENT_TYPE } from "@side-chat/chat-protocol";
import { Effect, Queue, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { createTurnActivityDispatcher } from "./turn-activity-dispatcher.js";

const notification = (
  subjectId: string,
  conversationId: string,
  status: string,
): TurnActivityNotification => ({
  workspaceId: "ws",
  subjectId,
  conversationId,
  assistantTurnId: `turn_${conversationId}`,
  status,
});

describe("createTurnActivityDispatcher", () => {
  it("fans a lifecycle signal out only to subscribers of its subject", async () => {
    const source = Effect.runSync(Queue.unbounded<TurnActivityNotification>());
    const dispatcher = createTurnActivityDispatcher({
      notificationSource: { notifications: Stream.fromQueue(source) },
    });

    const alice = await dispatcher.subscribe({ workspaceId: "ws", subjectId: "alice" });
    const bob = await dispatcher.subscribe({ workspaceId: "ws", subjectId: "bob" });

    await Effect.runPromise(Queue.offer(source, notification("alice", "conv_a", "running")));
    await Effect.runPromise(Queue.offer(source, notification("bob", "conv_b", "running")));

    const aliceEvent = await Effect.runPromise(Queue.take(alice.events));
    const bobEvent = await Effect.runPromise(Queue.take(bob.events));

    // Each subject sees only its own turn. If fan-out were unfiltered, bob's first
    // event would be conv_a (offered first), so this also proves the filtering.
    expect(aliceEvent).toEqual({
      type: TURN_ACTIVITY_EVENT_TYPE,
      conversationId: "conv_a",
      assistantTurnId: "turn_conv_a",
      status: "running",
    });
    expect(bobEvent.conversationId).toBe("conv_b");

    await dispatcher.shutdown();
  });
});
