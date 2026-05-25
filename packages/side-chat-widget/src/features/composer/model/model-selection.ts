export type AssistantProfileOption = {
  readonly id: string;
  readonly label: string;
};

export const defaultAssistantProfile: AssistantProfileOption = {
  id: "default",
  label: "Default",
};

export const normalizeAssistantProfiles = (
  profiles: readonly AssistantProfileOption[] | undefined,
): readonly AssistantProfileOption[] =>
  profiles && profiles.length > 0 ? profiles : [defaultAssistantProfile];

export const resolveAssistantProfileId = (
  requested: string | undefined,
  profiles: readonly AssistantProfileOption[],
): string => {
  if (requested && profiles.some((profile) => profile.id === requested)) {
    return requested;
  }
  return profiles[0]?.id ?? defaultAssistantProfile.id;
};
