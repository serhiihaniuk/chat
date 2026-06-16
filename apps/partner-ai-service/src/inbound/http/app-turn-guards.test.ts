import { PROTOCOL_ERROR_CODES, SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { createMemorySidechatRepositories } from "@side-chat/db";
import type { TurnGuard } from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createPartnerAiServiceApp } from "./app.js";

const validRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_guard_001",
  message: { id: "message_guard_001", content: "hello service" },
  hostContext: {
    schemaVersion: "host.v1",
    origin: "https://host.example",
    metadata: { tenantId: "not-authoritative" },
  },
};

describe("partner ai service turn guards", () => {
  it("maps blocked guards to their protocol HTTP status before persistence", async () => {
    const repositories = createMemorySidechatRepositories();
    const response = await createPartnerAiServiceApp({
      repositories,
      turnGuardIds: ["service.test.guard"],
      turnGuards: {
        guards: [
          createTurnGuard(() =>
            Effect.succeed({
              kind: "block",
              publicReason: "Turn guard rate limit reached.",
              internalReason: "classifier quota",
              errorCode: PROTOCOL_ERROR_CODES.RATE_LIMITED,
            }),
          ),
        ],
      },
    }).request("/chat/stream", {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(validRequest),
    });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      code: PROTOCOL_ERROR_CODES.RATE_LIMITED,
      message: "Turn guard rate limit reached.",
      retryable: false,
    });
    expect(repositories.snapshot()).toMatchObject(emptyPersistenceSnapshot);
  });

  it("maps failed guards to internal-error HTTP status before persistence", async () => {
    const repositories = createMemorySidechatRepositories();
    const response = await createPartnerAiServiceApp({
      repositories,
      turnGuardIds: ["service.test.guard"],
      turnGuards: {
        guards: [createTurnGuard(() => Effect.fail(new Error("classifier unavailable")))],
      },
    }).request("/chat/stream", {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(validRequest),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      code: PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
      message: "classifier unavailable",
      retryable: false,
    });
    expect(repositories.snapshot()).toMatchObject(emptyPersistenceSnapshot);
  });
});

const emptyPersistenceSnapshot = {
  conversations: [],
  messages: [],
  assistantTurns: [],
  usageRecords: [],
};

const createTurnGuard = (check: TurnGuard["check"]): TurnGuard => ({
  guardId: "service.test.guard",
  description: "Deterministic service test guard.",
  check,
});
