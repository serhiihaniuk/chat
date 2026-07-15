import { describe, expect, it } from "vitest";

import type {
  TurnActivityNotification,
  TurnActivityNotificationSource,
} from "#application/ports/turn/activity/turn-activity-source";
import { createTurnActivityDispatcher } from "./turn-activity-dispatcher.js";

describe("createTurnActivityDispatcher", () => {
  it("fans an identity invalidation out only to its authenticated subject", async () => {
    const source = notificationSource();
    const dispatcher = createTurnActivityDispatcher(source.source);
    const alice = await dispatcher.subscribe({ workspaceId: "workspace-1", subjectId: "alice" });
    const bob = await dispatcher.subscribe({ workspaceId: "workspace-1", subjectId: "bob" });
    const aliceReader = alice.events.getReader();
    const bobReader = bob.events.getReader();

    source.publish(notification("alice", "conversation-a"));
    source.publish(notification("bob", "conversation-b"));

    await expect(aliceReader.read()).resolves.toEqual({
      done: false,
      value: notification("alice", "conversation-a"),
    });
    await expect(bobReader.read()).resolves.toEqual({
      done: false,
      value: notification("bob", "conversation-b"),
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
  };
}

function notificationSource(): {
  source: TurnActivityNotificationSource;
  publish: (notification: TurnActivityNotification) => void;
} {
  let controller: ReadableStreamDefaultController<TurnActivityNotification>;
  return {
    source: {
      openNotifications: () =>
        new ReadableStream({
          start: (nextController) => {
            controller = nextController;
          },
        }),
    },
    publish: (value) => controller.enqueue(value),
  };
}
