import { createMemorySidechatRepositories } from "@side-chat/db";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createConversationPersistence } from "./service-conversation-persistence.js";

// issuedAt deliberately carries the old hardcoded auth default so each assertion
// proves the record clock comes from the threaded `now`, never from auth evidence.
const STALE_ISSUED_AT = "2026-05-23T13:00:00.000Z";
const TEST_CLOCK_NOW = "2026-06-21T08:30:00.000Z";

const authContext = {
  tenantId: "tenant_clock",
  workspaceId: "workspace_clock",
  subject: { subjectId: "subject_clock", userId: "user_clock" },
  actor: { subjectId: "subject_clock", userId: "user_clock" },
  source: "test_authority",
  issuedAt: STALE_ISSUED_AT,
} as const;

describe("service conversation persistence record clock", () => {
  it("stamps a new conversation with the caller clock, not auth issuedAt", async () => {
    const repositories = createMemorySidechatRepositories();
    const conversations = createConversationPersistence(repositories);

    await Effect.runPromise(
      conversations.ensureConversation({
        authContext,
        fallbackConversationId: "conversation_clock_1",
        now: TEST_CLOCK_NOW,
      }),
    );

    const stored = repositories.snapshot().conversations[0];
    expect(stored?.createdAt).toBe(TEST_CLOCK_NOW);
    expect(stored?.lastMessageAt).toBe(TEST_CLOCK_NOW);
    expect(stored?.createdAt).not.toBe(STALE_ISSUED_AT);
  });

  it("stamps an appended user message with the caller clock, not auth issuedAt", async () => {
    const repositories = createMemorySidechatRepositories();
    const conversations = createConversationPersistence(repositories);

    await Effect.runPromise(
      conversations.ensureConversation({
        authContext,
        fallbackConversationId: "conversation_clock_2",
        now: TEST_CLOCK_NOW,
      }),
    );
    await Effect.runPromise(
      conversations.appendUserMessage({
        authContext,
        conversationId: "conversation_clock_2",
        message: { id: "message_clock_1", content: "hello" },
        now: TEST_CLOCK_NOW,
      }),
    );

    const storedMessage = repositories.snapshot().messages[0];
    expect(storedMessage?.role).toBe("user");
    expect(storedMessage?.createdAt).toBe(TEST_CLOCK_NOW);
    expect(storedMessage?.createdAt).not.toBe(STALE_ISSUED_AT);
  });
});
