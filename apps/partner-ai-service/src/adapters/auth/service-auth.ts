import type { AuditActor, AuthContext, SubjectRef, WorkspaceRef } from "@side-chat/partner-ai-core";
import type { HostContext } from "@side-chat/chat-protocol";

export const DEFAULT_DEV_BEARER_TOKEN = "Bearer local-test-token";

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
        input.bearerToken === trustedToken
          ? toAuthContext(config, input.hostContext?.origin, issuedAtForConfig(config))
          : undefined,
      ),
  };
};

// The static-token authority "issues" the context when it verifies the token, so
// the authentic issue time is verification time unless a profile pins one. This
// is auth evidence only; record clocks come from the core clock port, never here.
const issuedAtForConfig = (config: ServiceAuthConfig): string =>
  config.issuedAt ?? new Date().toISOString();

const tokenForConfig = (config: ServiceAuthConfig): string => {
  if (config.profile === "development") {
    return config.devBearerToken ?? DEFAULT_DEV_BEARER_TOKEN;
  }

  if (!config.trustedBearerToken) {
    throw new ServiceAuthConfigurationError(
      "Production auth requires a trusted bearer-token authority adapter.",
    );
  }

  if (config.trustedBearerToken === DEFAULT_DEV_BEARER_TOKEN) {
    throw new ServiceAuthConfigurationError(
      "Development static auth cannot be used by the production profile.",
    );
  }

  return config.trustedBearerToken;
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
