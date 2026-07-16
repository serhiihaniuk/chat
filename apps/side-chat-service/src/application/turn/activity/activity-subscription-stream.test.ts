import { describe, expect, it } from "vitest";

import type {
  TurnActivityNotification,
  TurnActivityNotificationSource,
} from "#application/ports/turn/activity/turn-activity-source";
import type { AuthContext } from "#domain/auth-context";
import { createActivitySubscriptionStream } from "./activity-subscription-stream.js";
import { createTurnActivityDispatcher } from "./turn-activity-dispatcher.js";

const auth: AuthContext = {
  workspaceId: "workspace-1",
  subjectId: "subject-1",
  issuedAt: "2026-07-14T00:00:00.000Z",
};

describe("createActivitySubscriptionStream", () => {
  it("registers before the snapshot and verifies buffered invalidations afterward", async () => {
    const source = notificationSource();
    const dispatcher = createTurnActivityDispatcher(source.source);
    let readCount = 0;
    const events = createActivitySubscriptionStream(
      dispatcher,
      {
        listActiveTurns: async (receivedAuth) => {
          expect(receivedAuth).toEqual(auth);
          readCount += 1;
          if (readCount === 1) {
            source.publish(notification("conversation-live", "turn-live"));
            return [activeTurn("conversation-snapshot", "turn-snapshot")];
          }
          return [];
        },
      },
      auth,
    );
    const reader = events.getReader();

    await expect(reader.read()).resolves.toMatchObject({
      value: {
        kind: "snapshot",
        activeTurns: [
          { conversationId: "conversation-snapshot", assistantTurnId: "turn-snapshot" },
        ],
      },
    });
    await expect(reader.read()).resolves.toMatchObject({
      value: { kind: "transition", conversationId: "conversation-live", status: "terminal" },
    });
    await reader.cancel();
    await dispatcher.shutdown();
  });

  it("emits a synchronization barrier when no turn is running", async () => {
    const source = notificationSource();
    const dispatcher = createTurnActivityDispatcher(source.source);
    const events = createActivitySubscriptionStream(
      dispatcher,
      { listActiveTurns: () => Promise.resolve([]) },
      auth,
    );
    const reader = events.getReader();

    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: { kind: "snapshot", activeTurns: [] },
    });
    await reader.cancel();
    await dispatcher.shutdown();
  });

  it("does not publish a false running event when the Workflow run is missing", async () => {
    const source = notificationSource();
    const dispatcher = createTurnActivityDispatcher(source.source);
    const events = createActivitySubscriptionStream(
      dispatcher,
      { listActiveTurns: () => Promise.resolve([]) },
      auth,
    );
    const reader = events.getReader();

    await reader.read();
    source.publish(notification("conversation-1", "turn-1"));

    await expect(reader.read()).resolves.toMatchObject({
      value: {
        kind: "transition",
        conversationId: "conversation-1",
        assistantTurnId: "turn-1",
        status: "terminal",
      },
    });
    await reader.cancel();
    await dispatcher.shutdown();
  });

  it("does not claim synchronization when the authoritative snapshot fails", async () => {
    const source = notificationSource();
    const dispatcher = createTurnActivityDispatcher(source.source);
    const events = createActivitySubscriptionStream(
      dispatcher,
      { listActiveTurns: () => Promise.reject(new Error("database unavailable")) },
      auth,
    );

    await expect(events.getReader().read()).rejects.toThrow("database unavailable");
    await dispatcher.shutdown();
  });
});

function notification(conversationId: string, assistantTurnId: string): TurnActivityNotification {
  return {
    workspaceId: auth.workspaceId,
    subjectId: auth.subjectId,
    conversationId,
    assistantTurnId,
  };
}

function activeTurn(conversationId: string, turnId: string) {
  return { conversationId, turnId, runId: `run-${turnId}`, status: "running" as const };
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
