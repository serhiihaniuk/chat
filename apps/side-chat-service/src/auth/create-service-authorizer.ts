import type { RequestAuthorizer } from "@side-chat/side-chat-server";

import { AUTH_PROFILES } from "#config/declaration/side-chat-config";
import type { AuthSettings, DevelopmentAuthSettings } from "#config/settings/deployment-settings";

import { createProductionRequestAuthorizer } from "./production-request-authorizer.js";
import { createStaticTokenAuthorizer } from "./static-token-authorizer.js";

export function createServiceAuthorizer(settings: AuthSettings): RequestAuthorizer {
  if (settings.profile === AUTH_PROFILES.PRODUCTION) {
    return createProductionRequestAuthorizer();
  }
  return createDevelopmentAuthorizer(settings);
}

export function requireDevelopmentAuthSettings(settings: AuthSettings): DevelopmentAuthSettings {
  if (settings.profile === AUTH_PROFILES.DEVELOPMENT) return settings;
  throw new Error("Development static auth settings are required for local seeded conversations.");
}

function createDevelopmentAuthorizer(settings: DevelopmentAuthSettings): RequestAuthorizer {
  return createStaticTokenAuthorizer({
    bearerToken: settings.staticBearerToken,
    workspaceId: settings.workspaceId,
  });
}
