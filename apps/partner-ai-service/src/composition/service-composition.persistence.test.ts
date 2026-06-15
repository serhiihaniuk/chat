import {
  createMemorySidechatRepositories,
  REPOSITORY_ADAPTER_KINDS,
  type SidechatRepositories,
} from "@side-chat/db";
import { describe, expect, it } from "vitest";
import { composePartnerAiService } from "./service-composition.js";

const workspace = {
  tenantId: "tenant_tools",
  workspaceId: "workspace_tools",
} as const;

describe("service composition persistence metadata", () => {
  it("rejects explicit persistence config that does not match injected repositories", () => {
    expect(() =>
      composePartnerAiService({
        workspace,
        persistence: {
          kind: "postgres",
          databaseUrl: "postgres://sidechat:sidechat@localhost/sidechat",
        },
        repositories: createMemorySidechatRepositories(),
      }),
    ).toThrow("Persistence config postgres does not match injected memory repositories.");

    expect(() =>
      composePartnerAiService({
        workspace,
        persistence: { kind: "memory" },
        repositories: createPostgresDrizzleTaggedRepositories(),
      }),
    ).toThrow("Persistence config memory does not match injected postgres-drizzle repositories.");
  });

  it("rejects untagged injected repositories instead of classifying them as memory", () => {
    expect(() =>
      composePartnerAiService({
        workspace,
        repositories: createUntaggedRepositories(),
      }),
    ).toThrow(
      "Injected repositories must declare a valid adapterKind; service composition cannot infer persistence from untagged repositories.",
    );
  });
});

const createPostgresDrizzleTaggedRepositories = (): SidechatRepositories => ({
  ...createMemorySidechatRepositories(),
  adapterKind: REPOSITORY_ADAPTER_KINDS.POSTGRES_DRIZZLE,
});

const createUntaggedRepositories = (): SidechatRepositories => {
  const untaggedRepositories = { ...createMemorySidechatRepositories() };
  Reflect.deleteProperty(untaggedRepositories, "adapterKind");
  return untaggedRepositories as SidechatRepositories;
};
