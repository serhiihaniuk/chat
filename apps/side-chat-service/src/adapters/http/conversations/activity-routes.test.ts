import { describe, expect, it } from "vitest";
import { TURN_ACTIVITY_EVENT_TYPE, TURN_ACTIVITY_STATUS } from "@side-chat/stream-profile";

import { TURN_ACTIVITY_KIND } from "#domain/turn-activity";
import { toTurnActivityWireEvent } from "./activity-routes.js";

describe("activity route wire projection", () => {
  it("encodes the stream-profile-owned transition status without translation", () => {
    expect(
      toTurnActivityWireEvent({
        kind: TURN_ACTIVITY_KIND.TRANSITION,
        conversationId: "conversation-1",
        assistantTurnId: "turn-1",
        running: false,
      }),
    ).toEqual({
      type: TURN_ACTIVITY_EVENT_TYPE,
      conversationId: "conversation-1",
      assistantTurnId: "turn-1",
      status: TURN_ACTIVITY_STATUS.TERMINAL,
    });
  });
});
