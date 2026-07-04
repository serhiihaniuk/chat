import type {
  SideChatBooleanEnvReference,
  SideChatNumberEnvReference,
  SideChatStringEnvReference,
} from "../env-references.js";

/**
 * Process-env contract declared beside product config.
 *
 * These references are deployment wiring, not assistant behavior: they select
 * ports, posture, workspace identity, auth, and persistence after a config file
 * has been selected. The values are resolved at boot and secret references must
 * never appear in diagnostics, model catalogs, or browser protocol data.
 */
export type SideChatEnvironmentConfig = {
  /** HTTP port used by the Node service. */
  readonly port: SideChatNumberEnvReference;
  /** Deployment posture such as development or production. */
  readonly profile: SideChatStringEnvReference;
  /** Optional bearer token used by the service auth adapter. */
  readonly authBearerToken: SideChatStringEnvReference;
  /** Optional Postgres connection string; absence keeps development on memory storage. */
  readonly databaseUrl: SideChatStringEnvReference;
  /** Query-pool tunables; each is optional and falls back to the node-postgres default. */
  readonly databasePool: SideChatDatabasePoolConfig;
  /** Enables deterministic demo conversation seeding for local boot. */
  readonly demoSeedConversations: SideChatBooleanEnvReference;
  /** Minimum diagnostic log level: `debug` | `info` | `warn` | `error` (default `info`). */
  readonly logLevel: SideChatStringEnvReference;
  /** Diagnostic output format: `pretty` | `json`; absence defaults by profile. */
  readonly logFormat: SideChatStringEnvReference;
  /** Workspace scope used when requests do not carry a host-specific identity. */
  readonly tenantId: SideChatStringEnvReference;
  /** Workspace id used by repository and authorization adapters. */
  readonly workspaceId: SideChatStringEnvReference;
};

/**
 * Postgres query-pool tunables, each an optional env reference.
 *
 * Absent values keep the node-postgres defaults (max 10, no TLS). `ssl` enables
 * TLS for managed databases; connection-string `sslmode` still applies to the
 * dedicated `LISTEN` connections, which are not pooled.
 */
export type SideChatDatabasePoolConfig = {
  readonly max: SideChatNumberEnvReference;
  readonly idleTimeoutMillis: SideChatNumberEnvReference;
  readonly connectionTimeoutMillis: SideChatNumberEnvReference;
  readonly ssl: SideChatBooleanEnvReference;
};
