import { describe, expect, it } from "vitest";

import { ProtocolValidationError } from "../errors.js";
import { SIDECHAT_EVENT_TYPES } from "../events/event-union.js";
import { parseHistoryMessage } from "./validation.js";

const activityEvent = {
  protocolVersion: "sidechat.v1",
  type: SIDECHAT_EVENT_TYPES.ACTIVITY,
  eventId: "evt_activity_001",
  assistantTurnId: "turn_001",
  sequence: 2,
  createdAt: "2026-05-23T13:00:00.000Z",
  activityId: "activity_001",
  activityKind: "tool",
  status: "completed",
  title: "Run search",
  details: {
    tool: {
      toolCallId: "tool_001",
      toolName: "search",
      result: { answer: "found" },
    },
  },
};

describe("history message validation", () => {
  it("revalidates stored assistant activity as protocol events", () => {
    const message = parseHistoryMessage({
      id: "message_001",
      role: "assistant",
      content: "Here is the result.",
      sequence: 3,
      activity: [activityEvent],
    });

    expect(message.activity).toEqual([activityEvent]);
  });

  it.each([
    [{ ...activityEvent, status: "unknown" }],
    [{ ...activityEvent, providerPayload: { secret: true } }],
    [{ ...activityEvent, details: { tool: { toolName: "search" } } }],
    [
      {
        ...activityEvent,
        type: SIDECHAT_EVENT_TYPES.DELTA,
        content: "not an activity event",
      },
    ],
  ])("rejects malformed stored activity %#", (activity) => {
    expect(() =>
      parseHistoryMessage({
        id: "message_001",
        role: "assistant",
        content: "Here is the result.",
        sequence: 3,
        activity,
      }),
    ).toThrow(ProtocolValidationError);
  });

  it("rejects activity on a non-assistant message", () => {
    expect(() =>
      parseHistoryMessage({
        id: "message_001",
        role: "user",
        content: "Search for this.",
        sequence: 1,
        activity: [activityEvent],
      }),
    ).toThrow(/assistant messages/u);
  });
});
