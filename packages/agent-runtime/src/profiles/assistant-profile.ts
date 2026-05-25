export type AssistantProfile = {
  readonly profileId: string;
  readonly displayName?: string;
  readonly systemInstructions: string;
  readonly defaultProviderId?: string;
  readonly defaultModelId?: string;
  readonly defaultToolNames?: readonly string[];
};

export const DEFAULT_ASSISTANT_PROFILE_ID = "default" as const;

export const createDefaultAssistantProfile = (): AssistantProfile => ({
  profileId: DEFAULT_ASSISTANT_PROFILE_ID,
  systemInstructions:
    "Render final assistant answers as GitHub-flavored Markdown. Use bullet or numbered lists when the answer contains multiple items, preserve emphasis with Markdown syntax, and keep tool payload JSON out of the visible answer unless the user explicitly asks for raw data.",
});
