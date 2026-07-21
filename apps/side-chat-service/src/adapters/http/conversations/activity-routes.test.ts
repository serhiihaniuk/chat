import { describe, expect, it } from "vitest";
import { TURN_ACTIVITY_EVENT_TYPE, TURN_ACTIVITY_STATUS } from "@side-chat/stream-profile";
import type { RequestAuthorizer } from "@side-chat/side-chat-server";

import { TURN_ACTIVITY_KIND } from "#domain/turn-activity";
import { createServiceTestHarness } from "#composition/route/testing-harness/service-test-harness";
import { toTurnActivityWireEvent } from "./activity-routes.js";
import { HTTP_HEADERS } from "../http-contract.js";
import { HTTP_ERROR } from "../error-response.js";

const subjectAuthorizer: RequestAuthorizer = {
  authorize: ({ bearerToken }) =>
    Promise.resolve({
      workspaceId: "workspace-1",
      subjectId: bearerToken ?? "anonymous",
      issuedAt: "2026-07-21T00:00:00.000Z",
    }),
};

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

  it("rejects excess subject and process connections and releases cancelled streams", async () => {
    const harness = await createServiceTestHarness({
      authorizer: subjectAuthorizer,
      capacity: { maxActivityStreams: 1, maxActivityStreamsPerSubject: 1 },
    });
    try {
      const first = await requestActivity(harness, "subject-a");
      expect(first.status).toBe(200);

      const subjectLimited = await requestActivity(harness, "subject-a");
      expect(subjectLimited.status).toBe(HTTP_ERROR.TOO_MANY_REQUESTS.STATUS);
      expect(subjectLimited.headers.get(HTTP_HEADERS.RETRY_AFTER)).toBe("5");

      const processLimited = await requestActivity(harness, "subject-b");
      expect(processLimited.status).toBe(HTTP_ERROR.SERVICE_UNAVAILABLE.STATUS);
      expect(processLimited.headers.get(HTTP_HEADERS.RETRY_AFTER)).toBe("5");

      await first.body?.cancel();
      const afterCancellation = await requestActivity(harness, "subject-a");
      expect(afterCancellation.status).toBe(200);
      await afterCancellation.body?.cancel();
    } finally {
      await harness.close();
    }
  });
});

function requestActivity(
  harness: Awaited<ReturnType<typeof createServiceTestHarness>>,
  subject: string,
): Promise<Response> {
  return Promise.resolve(
    harness.request("/api/activity", {
      headers: { [HTTP_HEADERS.AUTHORIZATION]: subject },
    }),
  );
}
