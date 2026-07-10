import { SIDECHAT_EVENT_TYPES } from "@side-chat/chat-protocol";
import { describe, expect, it, vi } from "vitest";

import type { FetchLike } from "../client/side-chat-api-types.js";
import { readHistoryWithFetch } from "./side-chat-resource-client.js";

const clientOptions = { baseUrl: "https://assistant.example.test" };

describe("history resource validation", () => {
  it("returns protocol-validated stored activity", async () => {
    const activity = {
      protocolVersion: "sidechat.v1",
      type: SIDECHAT_EVENT_TYPES.ACTIVITY,
      eventId: "evt_activity_001",
      assistantTurnId: "turn_001",
      sequence: 2,
      createdAt: "2026-05-23T13:00:00.000Z",
      activityId: "activity_001",
      activityKind: "reasoning",
      status: "completed",
      title: "Thought",
    };
    const transport = vi.fn<FetchLike>(() =>
      Promise.resolve(
        Response.json({
          conversationId: "conversation_001",
          messages: [
            {
              id: "message_001",
              role: "assistant",
              content: "Answer",
              sequence: 3,
              activity: [activity],
            },
          ],
        }),
      ),
    );

    const history = await readHistoryWithFetch("conversation_001", clientOptions, {}, transport);

    expect(history.messages[0]?.activity).toEqual([activity]);
  });

  it("rejects malformed stored activity as a network boundary failure", async () => {
    const transport = vi.fn<FetchLike>(() =>
      Promise.resolve(
        Response.json({
          conversationId: "conversation_001",
          messages: [
            {
              id: "message_001",
              role: "assistant",
              content: "Answer",
              sequence: 3,
              activity: [{ type: SIDECHAT_EVENT_TYPES.ACTIVITY, providerPayload: "raw" }],
            },
          ],
        }),
      ),
    );

    await expect(
      readHistoryWithFetch("conversation_001", clientOptions, {}, transport),
    ).rejects.toMatchObject({ code: "network_error" });
  });
});
