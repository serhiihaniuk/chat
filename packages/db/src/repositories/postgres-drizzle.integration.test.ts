import { describe, expect, it } from "vitest";

import { createPostgresDrizzleSidechatRepositories } from "./postgres-drizzle.js";
import { sidechatRepositoryContract } from "./repository-contract.test-support.js";

const databaseUrl = requireDatabaseUrl();

describe("postgres drizzle repositories", () => {
  sidechatRepositoryContract("shared repository contract", () =>
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
    throw new Error("SIDECHAT_TEST_DATABASE_URL is required for test:db:integration.");
  }
  return value;
}
