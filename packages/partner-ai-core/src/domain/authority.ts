export const AUTHORITY_DENIAL_CODES = {
  missingAuth: "missing_auth",
  crossTenantWorkspace: "cross_tenant_workspace",
  missingScope: "missing_scope",
  productionAuthRequired: "production_auth_required",
} as const;

export type AuthorityDenialCode =
  (typeof AUTHORITY_DENIAL_CODES)[keyof typeof AUTHORITY_DENIAL_CODES];

export type AuthoritySource =
  | "signed_service_token"
  | "session_authority"
  | "test_authority";

export type AuthorityRole = "owner" | "admin" | "member" | "viewer";

export type AuthorityScope =
  | "conversation:read"
  | "conversation:write"
  | "message:write"
  | "tool:invoke"
  | "audit:write";

export type SubjectRef = {
  readonly subjectId: string;
  readonly userId: string;
};

export type WorkspaceRef = {
  readonly tenantId: string;
  readonly workspaceId: string;
};

export type AuditActor = SubjectRef & {
  readonly displayName?: string;
};

export type AuthContext = WorkspaceRef & {
  readonly subject: SubjectRef;
  readonly actor: AuditActor;
  readonly roles: readonly AuthorityRole[];
  readonly scopes: readonly AuthorityScope[];
  readonly source: AuthoritySource;
  readonly hostOrigin?: string;
  readonly issuedAt: string;
};

export type AuthorityDenial = {
  readonly allowed: false;
  readonly code: AuthorityDenialCode;
  readonly message: string;
};

export type AuthorityGrant = {
  readonly allowed: true;
  readonly authContext: AuthContext;
};

export type AuthorityDecision = AuthorityGrant | AuthorityDenial;

export const PRODUCTION_AUTHORITY_INVARIANT =
  "Production requests fail closed unless a trusted authority adapter returns an AuthContext; host context never establishes tenant, workspace, user, role, or scope authority.";

export const denyMissingAuth = (): AuthorityDenial => ({
  allowed: false,
  code: AUTHORITY_DENIAL_CODES.missingAuth,
  message: "A trusted AuthContext is required before protected work runs.",
});

export const requireAuthContext = (
  authContext: AuthContext | undefined,
): AuthorityDecision =>
  authContext ? { allowed: true, authContext } : denyMissingAuth();

export const assertWorkspaceAuthority = (
  authContext: AuthContext | undefined,
  workspace: WorkspaceRef,
): AuthorityDecision => {
  const required = requireAuthContext(authContext);
  if (!required.allowed) return required;

  const matchesTenant = required.authContext.tenantId === workspace.tenantId;
  const matchesWorkspace =
    required.authContext.workspaceId === workspace.workspaceId;

  if (!matchesTenant || !matchesWorkspace) {
    return {
      allowed: false,
      code: AUTHORITY_DENIAL_CODES.crossTenantWorkspace,
      message: "AuthContext does not grant access to the requested workspace.",
    };
  }

  return required;
};

export const assertRequiredScope = (
  authContext: AuthContext | undefined,
  scope: AuthorityScope,
): AuthorityDecision => {
  const required = requireAuthContext(authContext);
  if (!required.allowed) return required;

  if (!required.authContext.scopes.includes(scope)) {
    return {
      allowed: false,
      code: AUTHORITY_DENIAL_CODES.missingScope,
      message: `AuthContext is missing required scope ${scope}.`,
    };
  }

  return required;
};
