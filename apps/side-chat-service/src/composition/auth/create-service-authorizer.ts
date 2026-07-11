import { createStaticTokenAuthorizer } from "#adapters/auth/static-token-authorizer";
import type { RequestAuthorizer } from "#application/ports/request-authorizer";
import { AUTH_PROFILES } from "#config/declaration/side-chat-config";
import type { AuthSettings } from "#config/settings/deployment-settings";

export function createServiceAuthorizer(settings: AuthSettings): RequestAuthorizer {
  return createStaticTokenAuthorizer({
    allowDevelopmentToken: settings.profile === AUTH_PROFILES.DEVELOPMENT,
    bearerToken: settings.bearerToken,
    workspaceId: settings.workspaceId,
  });
}
