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
  /** Enables deterministic demo conversation seeding for local boot. */
  readonly demoSeedConversations: SideChatBooleanEnvReference;
  /** Workspace scope used when requests do not carry a host-specific identity. */
  readonly tenantId: SideChatStringEnvReference;
  /** Workspace id used by repository and authorization adapters. */
  readonly workspaceId: SideChatStringEnvReference;
};
