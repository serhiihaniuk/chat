import { PROTOCOL_ERROR_CODES, SIDECHAT_EVENT_TYPES } from "@side-chat/chat-protocol";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { PARTNER_AI_CORE_ERROR_CODES } from "#errors";
import { authContext, input } from "#testing/fixtures.test-support";
import { collect, createFakePorts, runStreamChat } from "#testing/fake-ports.test-support";

describe("stream chat concurrency and fail-open telemetry", () => {
  it("keeps a turn healthy when the observability sink always fails", async () => {
    // Telemetry is fail-open: a sink that rejects on every record must not reject
    // the request at pre-start or abort the healthy stream mid-generation.
    const ports = createFakePorts({
      authContext,
      observability: { record: () => Effect.fail(new Error("sink boom")) },
    });

    const events = await collect(runStreamChat(input, ports));

    expect(events.at(-1)?.type).toBe(SIDECHAT_EVENT_TYPES.COMPLETED);
    expect(ports.completedTurns).toHaveLength(1);
  });

  it("rejects a concurrent run when another request owns the conversation's turn", async () => {
    const ports = createFakePorts({
      authContext,
      activeConversationTurn: { assistantTurnId: "turn_other", requestId: "request_other" },
    });

    await expect(collect(runStreamChat(input, ports))).rejects.toMatchObject({
      code: PARTNER_AI_CORE_ERROR_CODES.CONVERSATION_BUSY,
      protocolCode: PROTOCOL_ERROR_CODES.CONFLICT,
    });
    // The guard runs after the conversation is ensured, before any durable write.
    expect(ports.calls).toEqual([
      "hostCapabilities",
      "turnPolicy",
      "policy",
      "ensureConversation",
      "findActiveConversationTurn",
    ]);
  });

  it("lets the same request's own in-flight turn pass the busy guard", async () => {
    // An idempotent retry of the same request must not be rejected as busy.
    const ports = createFakePorts({
      authContext,
      activeConversationTurn: { assistantTurnId: "assistant_turn_001", requestId: "request_001" },
    });

    expect((await collect(runStreamChat(input, ports))).at(-1)?.type).toBe(
      SIDECHAT_EVENT_TYPES.COMPLETED,
    );
  });
});
