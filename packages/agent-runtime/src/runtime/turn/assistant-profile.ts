import { AgentRuntimeError } from "../contract/runtime-error.js";
import { RUNTIME_ERROR_CODES } from "../contract/runtime-event.js";

/**
 * Reusable setup for a kind of assistant.
 *
 * The caller still decides whether the current user may use this profile.
 */
export type AssistantProfile = {
  readonly profileId: string;
  readonly displayName?: string;
  readonly systemInstructions: string;
  readonly defaultProviderId?: string;
  readonly defaultModelId?: string;
  readonly defaultToolNames?: readonly string[];
};

/**
 * Fallback profile for tests and small local apps that did not register one.
 */
export const DEFAULT_ASSISTANT_PROFILE_ID = "default" as const;

export const createDefaultAssistantProfile = (): AssistantProfile => ({
  profileId: DEFAULT_ASSISTANT_PROFILE_ID,
  systemInstructions:
    "Render final assistant answers as GitHub-flavored Markdown. Use bullet or numbered lists when the answer contains multiple items, preserve emphasis with Markdown syntax, and keep tool payload JSON out of the visible answer unless the user explicitly asks for raw data.",
});

export type ProfileCatalog = {
  readonly byId: ReadonlyMap<string, AssistantProfile>;
};

export const createProfileCatalog = (
  profiles: readonly AssistantProfile[] = [createDefaultAssistantProfile()],
): ProfileCatalog => {
  const normalizedProfiles = profiles.length > 0 ? profiles : [createDefaultAssistantProfile()];
  const byId = new Map<string, AssistantProfile>();
  for (const profile of normalizedProfiles) {
    if (byId.has(profile.profileId)) {
      throw new AgentRuntimeError(
        RUNTIME_ERROR_CODES.INTERNAL_ERROR,
        `duplicate profile ${profile.profileId}`,
      );
    }
    byId.set(profile.profileId, profile);
  }

  return { byId };
};

/**
 * Return the requested profile, or the built-in default when none is named.
 *
 * A missing profile fails instead of silently changing instructions or model
 * defaults.
 */
export const resolveProfile = (
  catalog: ProfileCatalog,
  profileId: string | undefined = DEFAULT_ASSISTANT_PROFILE_ID,
): AssistantProfile => {
  const profile = catalog.byId.get(profileId);
  if (!profile) {
    throw new AgentRuntimeError(
      RUNTIME_ERROR_CODES.INTERNAL_ERROR,
      `profile ${profileId} is not registered`,
    );
  }
  return profile;
};
