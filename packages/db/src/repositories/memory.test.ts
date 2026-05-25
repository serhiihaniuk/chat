import { createMemorySidechatRepositories } from "./memory.js";
import { sidechatRepositoryContract } from "./repository-contract.test-support.js";

sidechatRepositoryContract("memory sidechat repositories", () =>
  createMemorySidechatRepositories({ idPrefix: "test" }),
);
