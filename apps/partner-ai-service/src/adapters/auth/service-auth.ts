import { createHash, timingSafeEqual } from "node:crypto";

import type { AuditActor, AuthContext, SubjectRef, WorkspaceRef } from "@side-chat/partner-ai-core";
import type { HostContext } from "@side-chat/chat-protocol";

export const DEFAULT_DEV_BEARER_TOKEN = "Bearer local-test-token";

/**
 * Normalize a bearer token to the `Bearer <token>` header form.
 *
 * The single normalizer for tokens the service compares: a raw token from config
 * OR directly-passed options is treated the same as one already carrying the
 * `Bearer ` prefix, so both authorize the identical `Authorization` header.
 */
export const normalizeBearerToken = (token: string): string =>
  token.startsWith("Bearer ") ? token : `Bearer ${token}`;

export type DevelopmentAuthConfig = {
  readonly profile: "development";
  readonly devBearerToken?: string | undefined;
  readonly workspace: WorkspaceRef;
  readonly subject?: SubjectRef | undefined;
  readonly actor?: AuditActor | undefined;
  readonly issuedAt?: string | undefined;
};

export type ProductionAuthConfig = {
  readonly profile: "production";
  readonly trustedBearerToken?: string | undefined;
  readonly workspace: WorkspaceRef;
  readonly subject?: SubjectRef | undefined;
  readonly actor?: AuditActor | undefined;
  readonly issuedAt?: string | undefined;
};

export type ServiceAuthConfig = DevelopmentAuthConfig | ProductionAuthConfig;

export type HostProvidedContext = Pick<
  HostContext,
  "schemaVersion" | "origin" | "url" | "title" | "metadata"
>;

export type ServiceAuthInput = {
  readonly requestId: string;
  readonly bearerToken?: string | undefined;
  readonly hostContext?: HostProvidedContext | undefined;
};

export type ServiceAuthVerifier = {
  readonly resolveAuthContext: (input: ServiceAuthInput) => Promise<AuthContext | undefined>;
};

export class ServiceAuthConfigurationError extends Error {
  readonly code = "production_auth_required";

  constructor(message: string) {
    super(message);
    this.name = "ServiceAuthConfigurationError";
  }
}

export const createDevelopmentAuthConfig = (workspace: WorkspaceRef): DevelopmentAuthConfig => ({
  profile: "development",
  workspace,
});

export const createServiceAuthVerifier = (config: ServiceAuthConfig): ServiceAuthVerifier => {
  const trustedToken = tokenForConfig(config);
  return {
    resolveAuthContext: (input) =>
      Promise.resolve(
        input.bearerToken !== undefined && tokensMatch(input.bearerToken, trustedToken)
          ? toAuthContext(config, input.hostContext?.origin, issuedAtForConfig(config))
          : undefined,
      ),
  };
};

/**
 * Constant-time token equality.
 *
 * Both tokens are hashed to a fixed 32-byte digest first, so `timingSafeEqual`
 * never sees unequal lengths (which would throw and leak length), and the
 * comparison time does not depend on how many leading characters matched.
 */
const tokensMatch = (candidate: string, trusted: string): boolean =>
  timingSafeEqual(sha256(candidate), sha256(trusted));

const sha256 = (value: string): Buffer => createHash("sha256").update(value, "utf8").digest();

// The static-token authority "issues" the context when it verifies the token, so
// the authentic issue time is verification time unless a profile pins one. This
// is auth evidence only; record clocks come from the core clock port, never here.
const issuedAtForConfig = (config: ServiceAuthConfig): string =>
  config.issuedAt ?? new Date().toISOString();

const tokenForConfig = (config: ServiceAuthConfig): string => {
  if (config.profile === "development") {
    return normalizeBearerToken(config.devBearerToken ?? DEFAULT_DEV_BEARER_TOKEN);
  }

  if (!config.trustedBearerToken) {
    throw new ServiceAuthConfigurationError(
      "Production auth requires a trusted bearer-token authority adapter.",
    );
  }

  // Normalize before the guard so a directly-passed option token (no `Bearer `
  // prefix) is still caught if it is the dev default.
  const trusted = normalizeBearerToken(config.trustedBearerToken);
  if (trusted === DEFAULT_DEV_BEARER_TOKEN) {
    throw new ServiceAuthConfigurationError(
      "Development static auth cannot be used by the production profile.",
    );
  }

  return trusted;
};

const toAuthContext = (
  config: ServiceAuthConfig,
  hostOrigin: string | undefined,
  issuedAt: string,
): AuthContext => {
  const subject = config.subject ?? {
    subjectId: `${config.workspace.workspaceId}:subject`,
    userId: `${config.workspace.workspaceId}:user`,
  };
  return {
    ...config.workspace,
    subject,
    actor: config.actor ?? subject,
    roles: ["member"],
    scopes: ["conversation:read", "conversation:write", "message:write"],
    source: config.profile === "production" ? "signed_service_token" : "test_authority",
    hostOrigin: hostOrigin === "" ? undefined : hostOrigin,
    issuedAt,
  };
};
