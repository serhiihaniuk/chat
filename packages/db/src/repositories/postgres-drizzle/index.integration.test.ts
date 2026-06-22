import { describe, expect, it } from "vitest";

import { createPostgresDrizzleSidechatRepositories } from "./index.js";
import { conversationListRepositoryContract } from "#testing/conversation-list-contract.test-support";
import { sidechatRepositoryContract } from "#testing/repository-contract.test-support";
import { turnEventLogRepositoryContract } from "#testing/turn/turn-event-log-contract.test-support";
import { turnEventRetentionContract } from "#testing/turn/turn-event-retention-contract.test-support";
import { turnLeaseRepositoryContract } from "#testing/turn/turn-lease-contract.test-support";

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
  turnEventLogRepositoryContract("postgres drizzle repositories", () =>
    createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    }),
  );
  turnEventRetentionContract("postgres drizzle repositories", () =>
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
});

function requireDatabaseUrl(): string {
  const value = process.env["SIDECHAT_TEST_DATABASE_URL"];
  if (!value) {
    throw new Error(
      "SIDECHAT_TEST_DATABASE_URL is required for test:db:integration.",
    );
  }
  return value;
}
