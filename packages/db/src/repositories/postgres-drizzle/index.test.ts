import { afterEach, describe, expect, it } from "vitest";

import { REPOSITORY_ADAPTER_KINDS } from "../contract.js";
import {
  createPostgresDrizzleSidechatRepositories,
  type PostgresDrizzleSidechatRepositories,
} from "./index.js";

const repositoriesToClose: PostgresDrizzleSidechatRepositories[] = [];

afterEach(async () => {
  const openedRepositories = repositoriesToClose.splice(0);
  await Promise.all(openedRepositories.map((repositories) => repositories.close()));
});

describe("postgres drizzle sidechat repository adapter identity", () => {
  it("reports postgres-drizzle adapter metadata", () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: "postgres://sidechat:sidechat@localhost/sidechat",
    });
    repositoriesToClose.push(repositories);

    expect(repositories.adapterKind).toBe(REPOSITORY_ADAPTER_KINDS.POSTGRES_DRIZZLE);
    expect(repositories).not.toHaveProperty("kind");
  });
});
