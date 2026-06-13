import { createMemorySidechatRepositories } from "./index.js";
import { sidechatRepositoryContract } from "#testing/repository-contract.test-support";

sidechatRepositoryContract("memory sidechat repositories", () =>
  createMemorySidechatRepositories({ idPrefix: "test" }),
);
