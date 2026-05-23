import {
  createMemorySidechatRepositories,
  createPostgresDrizzleSidechatRepositories,
  type SidechatRepositories,
} from "@side-chat/db";

import {
  createDevelopmentAuthConfig,
  type ServiceAuthConfig,
} from "../adapters/auth/service-auth.js";
import {
  createDefaultPolicyConfig,
  type ServicePolicyConfig,
} from "../adapters/policy/service-policy.js";
import type { WorkspaceRef } from "@side-chat/partner-ai-core";

export type PersistenceConfig =
  | { readonly kind: "memory" }
  | { readonly kind: "postgres"; readonly databaseUrl: string };

export type ServiceComposition = {
  readonly workspace: WorkspaceRef;
  readonly auth: ServiceAuthConfig;
  readonly policies: ServicePolicyConfig;
  readonly persistence: PersistenceConfig;
  readonly repositories: SidechatRepositories;
  readonly persistenceLabel: "memory" | "postgres-drizzle";
};

export type ServiceCompositionOptions = {
  readonly workspace: WorkspaceRef;
  readonly auth?: ServiceAuthConfig;
  readonly policies?: ServicePolicyConfig;
  readonly persistence?: PersistenceConfig;
  readonly repositories?: SidechatRepositories;
};

export const composePartnerAiService = (
  options: ServiceCompositionOptions,
): ServiceComposition => {
  const auth = options.auth ?? createDevelopmentAuthConfig(options.workspace);
  const policies = options.policies ?? createDefaultPolicyConfig(auth.profile);
  const persistence =
    options.persistence ??
    defaultPersistenceForComposition(auth.profile, options.repositories);
  const repositories =
    options.repositories ?? createRepositoriesForPersistence(persistence);

  return {
    workspace: options.workspace,
    auth,
    policies,
    persistence,
    repositories,
    persistenceLabel:
      persistence.kind === "postgres" ? "postgres-drizzle" : "memory",
  };
};

const createRepositoriesForPersistence = (
  persistence: PersistenceConfig,
): SidechatRepositories => {
  if (persistence.kind === "postgres") {
    return createPostgresDrizzleSidechatRepositories({
      connectionString: persistence.databaseUrl,
    });
  }

  return createMemorySidechatRepositories();
};

const defaultPersistenceForComposition = (
  profile: ServiceAuthConfig["profile"],
  repositories: SidechatRepositories | undefined,
): PersistenceConfig => {
  if (repositories) return { kind: "memory" };
  if (profile === "production") return failMissingProductionPersistence();
  return { kind: "memory" };
};

const failMissingProductionPersistence = (): never => {
  throw new Error(
    "Production profile requires SIDECHAT_DATABASE_URL for Postgres/Drizzle persistence.",
  );
};
