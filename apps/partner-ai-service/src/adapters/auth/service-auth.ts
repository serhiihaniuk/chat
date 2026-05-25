import type { AuditActor, AuthContext, SubjectRef, WorkspaceRef } from "@side-chat/partner-ai-core";
import type { HostContext } from "@side-chat/chat-protocol";

export const DEFAULT_DEV_BEARER_TOKEN = "Bearer local-test-token";

export type DevelopmentAuthConfig = {
  readonly profile: "development";
  readonly devBearerToken?: string;
  readonly workspace: WorkspaceRef;
  readonly subject?: SubjectRef;
  readonly actor?: AuditActor;
  readonly issuedAt?: string;
};

export type ProductionAuthConfig = {
  readonly profile: "production";
  readonly trustedBearerToken?: string;
  readonly workspace: WorkspaceRef;
  readonly subject?: SubjectRef;
  readonly actor?: AuditActor;
  readonly issuedAt?: string;
};

export type ServiceAuthConfig = DevelopmentAuthConfig | ProductionAuthConfig;

export type HostProvidedContext = Pick<
  HostContext,
  "schemaVersion" | "origin" | "url" | "title" | "metadata"
>;

export type ServiceAuthInput = {
  readonly requestId: string;
  readonly bearerToken?: string;
  readonly hostContext?: HostProvidedContext;
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
          ? toAuthContext(config, input.hostContext?.origin)
          : undefined,
      ),
  };
};

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

const toAuthContext = (config: ServiceAuthConfig, hostOrigin: string | undefined): AuthContext => {
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
    ...(hostOrigin ? { hostOrigin } : {}),
    issuedAt: config.issuedAt ?? "2026-05-23T13:00:00.000Z",
  };
};
