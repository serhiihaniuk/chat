import { AgentRuntimeError } from "../contract/runtime-error.js";
import { RUNTIME_ERROR_CODES } from "../contract/runtime-event.js";

/**
 * AssistantProfile is a named assistant configuration used during turn setup.
 *
 * Source app policy can create an "analyst" profile that says "use these system instructions, usually
 * use provider X/model Y, and expose tools A and B unless the request narrows
 * the tool list." This avoids repeating those choices on every request while
 * still letting product policy override them per turn.
 *
 * A profile is not permission. The consuming app must decide whether a user or
 * tenant may use a profile before calling the runtime.
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
 * The built-in default keeps small runtimes from sending a model prompt with no
 * baseline assistant instructions.
 *
 * Tests and simple local setups can omit profiles and still get predictable
 * Markdown answers. Production composition should usually inject explicit
 * profiles instead of relying on this generic default.
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
 * Pick the profile that will provide instructions and usual choices for this turn.
 *
 * If the request does not name one, the built-in default is used. If it names a
 * missing profile, the request fails to preserve instructions and avoid silently swapping
 * the usual provider/model/tool choices would make the assistant behavior
 * surprising.
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
