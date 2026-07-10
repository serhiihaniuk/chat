// Owns: selecting the persistence config, building/validating repositories, and
// the secret-free persistence label.
// Does not own: the conversation/turn ports (built from these repositories in
// createStreamChatPorts), database URLs in diagnostics, or schema migrations.

import {
  createMemorySidechatRepositories,
  createPostgresDrizzleSidechatRepositories,
  isRepositoryAdapterKind,
  REPOSITORY_ADAPTER_KINDS,
  type RepositoryAdapterKind,
  type SidechatRepositories,
} from "@side-chat/db";

import type { DiagnosticLogger } from "@side-chat/shared";

import type { ServiceAuthConfig } from "#adapters/auth/service-auth";
import type { PersistenceConfig, ServiceCompositionOptions } from "../service-composition-types.js";
import type { ServicePersistenceBundle, ServiceSecurityBundle } from "../bundle-types.js";

/**
 * Resolve persistence config and repositories, failing closed on mismatch.
 *
 * Production profiles must declare explicit persistence; development falls back
 * to memory. Injected repositories must declare a valid adapter kind, and any
 * explicit persistence config must match that adapter kind, so the service never
 * reports persistence diagnostics it cannot honour.
 */
export const createServicePersistenceBundle = (
  options: ServiceCompositionOptions,
  security: ServiceSecurityBundle,
): ServicePersistenceBundle => {
  const persistence =
    options.persistence ?? defaultPersistence(security.auth.profile, options.repositories);
  const repositories =
    options.repositories ?? createRepositoriesForPersistence(persistence, options.diagnosticLogger);
  if (options.persistence) assertPersistenceMatchesRepositories(options.persistence, repositories);

  return {
    persistence,
    repositories,
    persistenceLabel: persistenceLabelForRepositories(repositories),
  };
};

const createRepositoriesForPersistence = (
  persistence: PersistenceConfig,
  logger: DiagnosticLogger | undefined,
): SidechatRepositories => {
  if (persistence.kind === "postgres") {
    return createPostgresDrizzleSidechatRepositories({
      connectionString: persistence.databaseUrl,
      pool: persistence.pool,
      logger,
    });
  }

  return createMemorySidechatRepositories();
};

const persistenceLabelForRepositories = (
  repositories: SidechatRepositories,
): ServicePersistenceBundle["persistenceLabel"] => {
  const adapterKind = readRepositoryAdapterKind(repositories);
  switch (adapterKind) {
    case REPOSITORY_ADAPTER_KINDS.MEMORY:
      return "memory";
    case REPOSITORY_ADAPTER_KINDS.POSTGRES_DRIZZLE:
      return "postgres-drizzle";
    case REPOSITORY_ADAPTER_KINDS.CUSTOM:
      throw new Error(
        "Custom repositories require service-level persistence metadata before composition can report persistence diagnostics.",
      );
  }

  const unhandledKind: never = adapterKind;
  return unhandledKind;
};

/**
 * Read the repository identity promised by `@side-chat/db`.
 *
 * Injected repository objects come from app code or tests, so composition still
 * checks the runtime value before publishing persistence diagnostics. Missing
 * or unknown markers fail closed instead of becoming local memory persistence.
 */
export const readRepositoryAdapterKind = (repositories: {
  readonly adapterKind?: unknown;
}): RepositoryAdapterKind => {
  const adapterKind: unknown = repositories.adapterKind;
  if (isRepositoryAdapterKind(adapterKind)) {
    return adapterKind;
  }

  throw new Error(
    "Injected repositories must declare a valid adapterKind; service composition cannot infer persistence from untagged repositories.",
  );
};

const assertPersistenceMatchesRepositories = (
  persistence: PersistenceConfig,
  repositories: SidechatRepositories,
): void => {
  const actualLabel = persistenceLabelForRepositories(repositories);
  const expectedLabel = persistence.kind === "postgres" ? "postgres-drizzle" : "memory";
  if (actualLabel === expectedLabel) return;

  throw new Error(
    `Persistence config ${persistence.kind} does not match injected ${actualLabel} repositories.`,
  );
};

const defaultPersistence = (
  profile: ServiceAuthConfig["profile"],
  repositories: SidechatRepositories | undefined,
): PersistenceConfig => {
  if (repositories) return { kind: "memory" };

  if (profile === "production") {
    throw new Error(
      "Production profile requires SIDECHAT_DATABASE_URL for Postgres/Drizzle persistence.",
    );
  }

  return { kind: "memory" };
};
