import { brandString, type Brand } from "@side-chat/shared";

export type TenantId = Brand<string, "TenantId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type SubjectId = Brand<string, "SubjectId">;
export type UserId = Brand<string, "UserId">;

export const toTenantId = (value: string): TenantId => brandString<"TenantId">(value);
export const toWorkspaceId = (value: string): WorkspaceId => brandString<"WorkspaceId">(value);
export const toSubjectId = (value: string): SubjectId => brandString<"SubjectId">(value);
export const toUserId = (value: string): UserId => brandString<"UserId">(value);

export const AUTHORITY_DENIAL_CODES = {
  MISSING_AUTH: "missing_auth",
  CROSS_TENANT_WORKSPACE: "cross_tenant_workspace",
  MISSING_SCOPE: "missing_scope",
  PRODUCTION_AUTH_REQUIRED: "production_auth_required",
} as const;

export type AuthorityDenialCode =
  (typeof AUTHORITY_DENIAL_CODES)[keyof typeof AUTHORITY_DENIAL_CODES];

export type AuthoritySource = "signed_service_token" | "session_authority" | "test_authority";

export type AuthorityRole = "owner" | "admin" | "member" | "viewer";

export type AuthorityScope =
  | "conversation:read"
  | "conversation:write"
  | "message:write"
  | "tool:invoke"
  | "audit:write";

export type SubjectRef = {
  readonly subjectId: SubjectId;
  readonly userId: UserId;
};

export type WorkspaceRef = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
};

export type AuditActor = SubjectRef & {
  readonly displayName?: string | undefined;
};

export type AuthContext = WorkspaceRef & {
  readonly subject: SubjectRef;
  readonly actor: AuditActor;
  readonly roles: readonly AuthorityRole[];
  readonly scopes: readonly AuthorityScope[];
  readonly source: AuthoritySource;
  readonly hostOrigin?: string | undefined;
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

/**
 * Missing auth is a workflow stop, not a recoverable runtime event.
 *
 * Core performs this check before persistence or model work so an unauthenticated
 * request cannot create conversations, append messages, call tools, or spend
 * provider tokens.
 */
export const denyMissingAuth = (): AuthorityDenial => ({
  allowed: false,
  code: AUTHORITY_DENIAL_CODES.MISSING_AUTH,
  message: "A trusted AuthContext is required before protected work runs.",
});

export const requireAuthContext = (authContext: AuthContext | undefined): AuthorityDecision =>
  authContext ? { allowed: true, authContext } : denyMissingAuth();

export const assertWorkspaceAuthority = (
  authContext: AuthContext | undefined,
  workspace: WorkspaceRef,
): AuthorityDecision => {
  const required = requireAuthContext(authContext);
  if (!required.allowed) return required;

  const matchesTenant = required.authContext.tenantId === workspace.tenantId;
  const matchesWorkspace = required.authContext.workspaceId === workspace.workspaceId;

  if (!matchesTenant || !matchesWorkspace) {
    return {
      allowed: false,
      code: AUTHORITY_DENIAL_CODES.CROSS_TENANT_WORKSPACE,
      message: "AuthContext does not grant access to the requested workspace.",
    };
  }

  return required;
};

/**
 * Scope checks are separate from workspace checks on purpose.
 *
 * Some requests only need workspace membership, while others need a specific
 * capability such as writing messages or invoking tools. Keeping this small
 * avoids baking route-specific policy into the shared workspace guard.
 */
export const assertRequiredScope = (
  authContext: AuthContext | undefined,
  scope: AuthorityScope,
): AuthorityDecision => {
  const required = requireAuthContext(authContext);
  if (!required.allowed) return required;

  if (!required.authContext.scopes.includes(scope)) {
    return {
      allowed: false,
      code: AUTHORITY_DENIAL_CODES.MISSING_SCOPE,
      message: `AuthContext is missing required scope ${scope}.`,
    };
  }

  return required;
};
