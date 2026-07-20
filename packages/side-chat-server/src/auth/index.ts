export type DurableActorRef = Readonly<{
  workspaceId: string;
  subjectId: string;
}>;

export type AuthContext = DurableActorRef &
  Readonly<{
    issuedAt: string;
  }>;

export type AuthorizationRequest = Readonly<{
  requestId: string;
  bearerToken?: string | undefined;
}>;

export interface RequestAuthorizer {
  readonly authorize: (request: AuthorizationRequest) => Promise<AuthContext | undefined>;
}

/** Project request authentication into the secret-free durable identity contract. */
export function toDurableActorRef(context: AuthContext): DurableActorRef {
  return Object.freeze({
    workspaceId: context.workspaceId,
    subjectId: context.subjectId,
  });
}
