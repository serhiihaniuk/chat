import { describe, expect, it } from "vitest";

import { REPOSITORY_ADAPTER_KINDS } from "../contract.js";
import { createMemorySidechatRepositories } from "./index.js";
import { conversationListRepositoryContract } from "#testing/conversation-list-contract.test-support";
import { sidechatRepositoryContract } from "#testing/repository-contract.test-support";
import { turnEventLogRepositoryContract } from "#testing/turn-event-log-contract.test-support";

sidechatRepositoryContract("memory sidechat repositories", () =>
  createMemorySidechatRepositories({ idPrefix: "test" }),
);
conversationListRepositoryContract("memory sidechat repositories", () =>
  createMemorySidechatRepositories({ idPrefix: "test" }),
);
turnEventLogRepositoryContract("memory sidechat repositories", () =>
  createMemorySidechatRepositories({ idPrefix: "test" }),
);

describe("memory sidechat repository adapter identity", () => {
  it("reports memory adapter metadata", () => {
    const repositories = createMemorySidechatRepositories({ idPrefix: "identity" });

    expect(repositories.adapterKind).toBe(REPOSITORY_ADAPTER_KINDS.MEMORY);
    expect(repositories).not.toHaveProperty("kind");
  });
});
