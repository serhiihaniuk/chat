import type { AuthContext } from "#domain/auth-context";

export type AuthorizationRequest = Readonly<{
  requestId: string;
  bearerToken?: string | undefined;
}>;

export interface RequestAuthorizer {
  readonly authorize: (request: AuthorizationRequest) => Promise<AuthContext | undefined>;
}
