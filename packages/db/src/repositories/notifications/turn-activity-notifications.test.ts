import { describe, expect, it } from "vitest";

import { parseTurnActivityNotification } from "./turn-activity-notifications.js";

describe("parseTurnActivityNotification", () => {
  it("accepts the identity-only lifecycle payload", () => {
    expect(
      parseTurnActivityNotification(
        JSON.stringify({
          workspaceId: "workspace-1",
          subjectId: "subject-1",
          conversationId: "conversation-1",
          assistantTurnId: "turn-1",
          status: "running",
        }),
      ),
    ).toEqual({
      workspaceId: "workspace-1",
      subjectId: "subject-1",
      conversationId: "conversation-1",
      assistantTurnId: "turn-1",
      status: "running",
    });
  });

  it.each([undefined, "not-json", "{}", JSON.stringify({ conversationId: "conversation-1" })])(
    "skips malformed payload %s",
    (payload) => expect(parseTurnActivityNotification(payload)).toBeUndefined(),
  );
});
