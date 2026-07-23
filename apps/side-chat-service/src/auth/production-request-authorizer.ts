import type { RequestAuthorizer } from "@side-chat/side-chat-server";

export class ProductionAuthBindingError extends Error {
  readonly code = "production_authorizer_required";
}

/**
 * Production auth is intentionally app-local because real deployments bind to
 * their own identity provider, tenant lookup, and credential store here.
 */
export function createProductionRequestAuthorizer(): RequestAuthorizer {
  throw new ProductionAuthBindingError(
    "Production auth requires an app-local RequestAuthorizer binding in apps/side-chat-service/src/auth/production-request-authorizer.ts",
  );
}
