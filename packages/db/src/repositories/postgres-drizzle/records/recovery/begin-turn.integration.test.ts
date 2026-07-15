import { describe, expect, it } from "vitest";

import { toMessageId, toUserMessageId } from "#schema-contract";
import { DB_REPOSITORY_ERROR_CODES } from "#repositories/errors";
import {
  beginTurnCommand,
  readConversationHistory,
  subjectId,
  workspaceId,
} from "#testing/repository-contract.helpers";
import { createPostgresDrizzleSidechatRepositories } from "../../index.js";

const databaseUrl = requireDatabaseUrl();
const NOW = "2026-05-23T13:00:00.000Z";
let scopeIndex = 0;

describe("postgres atomic assistant-turn begin", () => {
  it("accepts only one simultaneous turn aggregate and leaves no losing message", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    const scope = nextScope();
    const conversationId = `conversation_${scope}`;
    try {
      const outcomes = await Promise.allSettled([
        repositories.beginAssistantTurn(
          beginTurnCommand(scope, conversationId, `${scope}_request_a`, "first contender"),
        ),
        repositories.beginAssistantTurn(
          beginTurnCommand(scope, conversationId, `${scope}_request_b`, "second contender"),
        ),
      ]);
      const accepted = outcomes.filter((outcome) => outcome.status === "fulfilled");
      const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
      const history = await readConversationHistory(repositories, scope, conversationId);

      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({
        reason: { code: DB_REPOSITORY_ERROR_CODES.CONVERSATION_BUSY },
      });
      expect(history).toHaveLength(1);
      expect(["first contender", "second contender"]).toContain(history[0]?.parts[0]?.["text"]);
    } finally {
      await repositories.close();
    }
  });

  it("rejects mismatched request-id replay without changing the committed aggregate", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    const scope = nextScope();
    const conversationId = `conversation_${scope}`;
    const requestId = `${scope}_request`;
    try {
      const original = await repositories.beginAssistantTurn(
        beginTurnCommand(scope, conversationId, requestId, "original"),
      );

      await expect(
        repositories.beginAssistantTurn(
          beginTurnCommand(scope, conversationId, requestId, "different"),
        ),
      ).rejects.toMatchObject({ code: DB_REPOSITORY_ERROR_CODES.IDEMPOTENCY_CONFLICT });

      const history = await readConversationHistory(repositories, scope, conversationId);
      expect(history).toHaveLength(1);
      expect(history[0]?.messageId).toBe(original.userMessage.messageId);
      expect(history[0]?.parts).toEqual([{ type: "text", text: "original" }]);
    } finally {
      await repositories.close();
    }
  });

  it("rolls back a new conversation when message identity conflicts", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    const scope = nextScope();
    const existing = await repositories.createOrGetConversation({
      workspaceId: workspaceId(scope),
      subjectId: subjectId(scope),
      actorId: `actor_${scope}`,
      conversationKey: "existing",
      now: NOW,
    });
    const conflictingMessageId = toMessageId(`${scope}_shared_message`);
    try {
      await repositories.appendMessage({
        workspaceId: workspaceId(scope),
        subjectId: subjectId(scope),
        conversationId: existing.record.conversationId,
        messageId: conflictingMessageId,
        role: "user",
        parts: [{ type: "text", text: "existing" }],
        metadataJson: {},
        now: NOW,
      });
      const newConversationId = `conversation_${scope}_must_rollback`;
      const command = beginTurnCommand(scope, newConversationId, `${scope}_request`);

      await expect(
        repositories.beginAssistantTurn({
          ...command,
          userMessageId: toUserMessageId(conflictingMessageId),
          userMessage: { ...command.userMessage, messageId: conflictingMessageId },
        }),
      ).rejects.toMatchObject({ code: DB_REPOSITORY_ERROR_CODES.IDEMPOTENCY_CONFLICT });

      await expect(
        repositories.findConversation({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          conversationId: newConversationId,
        }),
      ).resolves.toBeUndefined();
    } finally {
      await repositories.close();
    }
  });

  it("rolls back the losing aggregate when one request id races across conversations", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    const scope = nextScope();
    const requestId = `${scope}_shared_request`;
    const firstConversationId = `conversation_${scope}_a`;
    const secondConversationId = `conversation_${scope}_b`;
    try {
      const outcomes = await Promise.allSettled([
        repositories.beginAssistantTurn(
          beginTurnCommand(scope, firstConversationId, requestId, "first"),
        ),
        repositories.beginAssistantTurn(
          beginTurnCommand(scope, secondConversationId, requestId, "second"),
        ),
      ]);
      const accepted = outcomes.find((outcome) => outcome.status === "fulfilled");
      const rejected = outcomes.find((outcome) => outcome.status === "rejected");

      expect(accepted?.status).toBe("fulfilled");
      expect(rejected).toMatchObject({
        status: "rejected",
        reason: { code: DB_REPOSITORY_ERROR_CODES.IDEMPOTENCY_CONFLICT },
      });
      if (accepted?.status !== "fulfilled") throw new Error("Expected one accepted aggregate.");
      const winningConversationId = accepted.value.conversation.conversationId;
      const losingConversationId =
        winningConversationId === firstConversationId ? secondConversationId : firstConversationId;
      await expect(
        repositories.findConversation({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          conversationId: losingConversationId,
        }),
      ).resolves.toBeUndefined();
    } finally {
      await repositories.close();
    }
  });
});

function nextScope(): string {
  scopeIndex += 1;
  return `begin_turn_${scopeIndex}`;
}

function requireDatabaseUrl(): string {
  const value = process.env["SIDECHAT_TEST_DATABASE_URL"];
  if (!value) {
    throw new Error("SIDECHAT_TEST_DATABASE_URL is required for test:db:integration.");
  }
  return value;
}
