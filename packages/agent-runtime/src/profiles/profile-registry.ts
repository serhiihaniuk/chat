import { AgentRuntimeError } from "#runtime/runtime-error";
import {
  createDefaultAssistantProfile,
  DEFAULT_ASSISTANT_PROFILE_ID,
  type AssistantProfile,
} from "./assistant-profile.js";

export type ProfileRegistry = {
  readonly profiles: readonly AssistantProfile[];
  resolve(profileId?: string): AssistantProfile;
};

export const createProfileRegistry = (
  profiles: readonly AssistantProfile[] = [createDefaultAssistantProfile()],
): ProfileRegistry => {
  const normalizedProfiles = profiles.length > 0 ? profiles : [createDefaultAssistantProfile()];
  const byId = new Map<string, AssistantProfile>();
  for (const profile of normalizedProfiles) {
    if (byId.has(profile.profileId)) {
      throw new AgentRuntimeError("internal_error", `duplicate profile ${profile.profileId}`);
    }
    byId.set(profile.profileId, profile);
  }

  return {
    profiles: normalizedProfiles,
    resolve(profileId = DEFAULT_ASSISTANT_PROFILE_ID) {
      const profile = byId.get(profileId);
      if (!profile) {
        throw new AgentRuntimeError("internal_error", `profile ${profileId} is not registered`);
      }
      return profile;
    },
  };
};
