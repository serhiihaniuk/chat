/**
 * Authentication contracts shared by the HTTP adapter and durable execution.
 *
 * Bearer credentials exist only on the request-scoped authorization input.
 * Workflow persistence receives the smaller secret-free actor reference.
 */
export type DurableActorRef = Readonly<{
  /** Globally unique, tenant-qualified scope; never reuse an adopter-local workspace id across tenants. */
  workspaceId: string;
  subjectId: string;
}>;

export type AuthContext = DurableActorRef &
  Readonly<{
    issuedAt: string;
  }>;

export type AuthorizationRequest = Readonly<{
  requestId: string;
  /** Forwarded only to the configured authorizer; never copied into durable state. */
  bearerToken?: string | undefined;
}>;

export interface RequestAuthorizer {
  /** Return `undefined` for unauthenticated requests without exposing credential detail. */
  readonly authorize: (request: AuthorizationRequest) => Promise<AuthContext | undefined>;
}

/** Project request authentication into the secret-free durable identity contract. */
export function toDurableActorRef(context: AuthContext): DurableActorRef {
  return Object.freeze({
    workspaceId: context.workspaceId,
    subjectId: context.subjectId,
  });
}
