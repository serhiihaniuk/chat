import type { RequestAuthorizer } from "@side-chat/side-chat-server";

import { AUTH_PROFILES } from "#config/declaration/side-chat-config";
import type { AuthSettings } from "#config/settings/deployment-settings";

import { createStaticTokenAuthorizer } from "./static-token-authorizer.js";

export function createServiceAuthorizer(settings: AuthSettings): RequestAuthorizer {
  return createStaticTokenAuthorizer({
    allowDevelopmentToken: settings.profile === AUTH_PROFILES.DEVELOPMENT,
    bearerToken: settings.bearerToken,
    workspaceId: settings.workspaceId,
  });
}
