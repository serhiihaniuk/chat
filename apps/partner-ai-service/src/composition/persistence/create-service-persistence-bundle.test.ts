import {
  createMemorySidechatRepositories,
  REPOSITORY_ADAPTER_KINDS,
  type SidechatRepositories,
} from "@side-chat/db";
import { describe, expect, it } from "vitest";
import type { ServiceSecurityBundle } from "../bundle-types.js";
import {
  createServicePersistenceBundle,
  readRepositoryAdapterKind,
} from "./create-service-persistence-bundle.js";

const workspace = { tenantId: "tenant_p", workspaceId: "workspace_p" } as const;

const developmentSecurity: ServiceSecurityBundle = {
  auth: { profile: "development", workspace },
  policies: { profile: "development", mode: "allow_all" },
};

const productionSecurity: ServiceSecurityBundle = {
  auth: { profile: "production", workspace },
  policies: { profile: "production", mode: "fail_closed" },
};

describe("createServicePersistenceBundle", () => {
  it("defaults development to memory persistence", () => {
    const bundle = createServicePersistenceBundle({ workspace }, developmentSecurity);

    expect(bundle.persistence).toEqual({ kind: "memory" });
    expect(bundle.persistenceLabel).toBe("memory");
  });

  it("fails closed when a production profile has no persistence and no repositories", () => {
    expect(() => createServicePersistenceBundle({ workspace }, productionSecurity)).toThrow(
      "Production profile requires SIDECHAT_DATABASE_URL",
    );
  });

  it("rejects persistence config that does not match injected repositories", () => {
    expect(() =>
      createServicePersistenceBundle(
        {
          workspace,
          persistence: { kind: "postgres", databaseUrl: "postgres://local/db" },
          repositories: createMemorySidechatRepositories(),
        },
        developmentSecurity,
      ),
    ).toThrow("Persistence config postgres does not match injected memory repositories.");
  });

  it("rejects untagged repositories instead of treating them as memory", () => {
    const untagged = { ...createMemorySidechatRepositories() };
    Reflect.deleteProperty(untagged, "adapterKind");

    expect(() => readRepositoryAdapterKind(untagged)).toThrow(
      "Injected repositories must declare a valid adapterKind",
    );
  });

  it("labels tagged postgres-drizzle repositories", () => {
    const repositories: SidechatRepositories = {
      ...createMemorySidechatRepositories(),
      adapterKind: REPOSITORY_ADAPTER_KINDS.POSTGRES_DRIZZLE,
    };

    const bundle = createServicePersistenceBundle(
      {
        workspace,
        persistence: { kind: "postgres", databaseUrl: "postgres://local/db" },
        repositories,
      },
      developmentSecurity,
    );

    expect(bundle.persistenceLabel).toBe("postgres-drizzle");
  });
});
