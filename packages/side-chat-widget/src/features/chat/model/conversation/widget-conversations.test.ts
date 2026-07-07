import { describe, expect, it } from "vitest";

import type { ReadHistoryResult } from "#entities/conversation";
import { toWidgetHistoryMessages } from "./widget-conversations.js";

const history = (messages: ReadHistoryResult["messages"]): ReadHistoryResult => ({
  conversationId: "conversation_001",
  messages,
});

const activityEvent = (sequence: number, title: string) =>
  ({
    protocolVersion: "sidechat.v1",
    type: "sidechat.activity",
    eventId: `evt-${sequence}`,
    assistantTurnId: "assistant_turn_001",
    sequence,
    createdAt: `2026-07-06T00:00:0${sequence}.000Z`,
    activityId: `activity_00${sequence}`,
    activityKind: "tool",
    status: "completed",
    title,
  }) as const;

describe("toWidgetHistoryMessages", () => {
  it("folds a stored activity trace through the live-stream reducer", () => {
    const messages = toWidgetHistoryMessages(
      history([
        { id: "msg_1", role: "user", content: "find docs", sequence: 0 },
        {
          id: "msg_2",
          role: "assistant",
          content: "Here they are.",
          sequence: 1,
          activity: [activityEvent(1, "Ran a tool"), activityEvent(2, "Ran another")],
        },
      ]),
    );

    expect(messages[0]?.activity.items).toHaveLength(0);
    expect(messages[1]?.activity.items).toHaveLength(2);
    expect(messages[1]?.activity.items[0]?.title).toBe("Ran a tool");
    // The last stored event's timestamp closes the thinking window, so the
    // "Thought for Ns" label renders for a reloaded transcript too.
    expect(messages[1]?.activity.completedAt).toBe("2026-07-06T00:00:02.000Z");
  });

  it("keeps an empty timeline for messages without a stored trace", () => {
    const messages = toWidgetHistoryMessages(
      history([{ id: "msg_1", role: "assistant", content: "plain", sequence: 0 }]),
    );

    expect(messages[0]?.activity.items).toHaveLength(0);
    expect(messages[0]?.activity.completedAt).toBeUndefined();
  });
});
