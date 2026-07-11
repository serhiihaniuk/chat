import { createHash, timingSafeEqual } from "node:crypto";

import type { RequestAuthorizer } from "#application/ports/request-authorizer";

export const DEVELOPMENT_BEARER_TOKEN = "Bearer local-test-token";

export type StaticTokenAuthorizerOptions = Readonly<{
  profile: "development" | "production";
  bearerToken: string;
  workspaceId: string;
  now?: () => Date;
}>;

export class AuthConfigurationError extends Error {
  readonly code = "production_auth_required";
}

export function createStaticTokenAuthorizer(
  options: StaticTokenAuthorizerOptions,
): RequestAuthorizer {
  const trustedToken = normalizeBearerToken(options.bearerToken);
  if (options.profile === "production" && trustedToken === DEVELOPMENT_BEARER_TOKEN) {
    throw new AuthConfigurationError("Production auth cannot use the development bearer token");
  }
  return {
    authorize: (request) =>
      Promise.resolve(
        request.bearerToken !== undefined && tokensMatch(request.bearerToken, trustedToken)
          ? {
              workspaceId: options.workspaceId,
              subjectId: `${options.workspaceId}:subject`,
              issuedAt: (options.now ?? (() => new Date()))().toISOString(),
            }
          : undefined,
      ),
  };
}

export function normalizeBearerToken(token: string): string {
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

function tokensMatch(candidate: string, trusted: string): boolean {
  return timingSafeEqual(sha256(candidate), sha256(trusted));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
