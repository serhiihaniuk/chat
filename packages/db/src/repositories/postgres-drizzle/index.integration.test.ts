import { describe, expect, it } from "vitest";

import { createPostgresDrizzleSidechatRepositories } from "./index.js";
import { conversationListRepositoryContract } from "#testing/conversation-list-contract.test-support";
import { sidechatRepositoryContract } from "#testing/repository-contract.test-support";
import { turnLeaseRepositoryContract } from "#testing/turn/turn-lease-contract.test-support";
import { turnResolutionRepositoryContract } from "#testing/turn/turn-resolution-contract.test-support";

const databaseUrl = requireDatabaseUrl();

describe("postgres drizzle repositories", () => {
  sidechatRepositoryContract("shared repository contract", () =>
    createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    }),
  );
  conversationListRepositoryContract("postgres drizzle repositories", () =>
    createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    }),
  );
  turnResolutionRepositoryContract("postgres drizzle repositories", () =>
    createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    }),
  );
  turnLeaseRepositoryContract("postgres drizzle repositories", () =>
    createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    }),
  );

  it("keeps the real adapter closeable for externally provisioned DBs", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    await expect(repositories.close()).resolves.toBeUndefined();
  });

  it("gives concurrent appends to one conversation distinct sequence indexes", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    const scope = { workspaceId: "workspace_concurrent", subjectId: "subject_concurrent" } as const;
    try {
      const conversation = await repositories.createOrGetConversation({
        ...scope,
        actorId: "actor_concurrent",
        conversationKey: "concurrent",
        now: NOW,
      });
      const append = (requestKey: string) =>
        repositories.appendMessage({
          ...scope,
          conversationId: conversation.record.conversationId,
          role: "user",
          contentText: "hello",
          metadataJson: {},
          idempotencyKey: { value: `${requestKey}:user` },
          now: NOW,
        });

      // The conversation-row FOR UPDATE lock serializes the two racing appends, so
      // neither loses the sequence unique index to a duplicate-index conflict.
      const [first, second] = await Promise.all([append("request_a"), append("request_b")]);

      expect(first.inserted && second.inserted).toBe(true);
      expect(
        [first.record.sequenceIndex, second.record.sequenceIndex].sort((a, b) => a - b),
      ).toEqual([0, 1]);
    } finally {
      await repositories.close();
    }
  });
});

const NOW = "2026-05-23T13:00:00.000Z";

function requireDatabaseUrl(): string {
  const value = process.env["SIDECHAT_TEST_DATABASE_URL"];
  if (!value) {
    throw new Error("SIDECHAT_TEST_DATABASE_URL is required for test:db:integration.");
  }
  return value;
}
