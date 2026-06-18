import type { ServiceAssistantConfig } from "./assistant-profile-registry.js";

/**
 * The built-in default assistant, expressed as ordinary service config.
 *
 * The default prompt now lives here instead of inside manifest construction, so
 * the default assistant builds through the same registry path as adopter
 * assistants. Provider/model, allowed tools, and guard ids are supplied by
 * composition from the provider, tool, and guard registries.
 */
export const DEFAULT_ASSISTANT_PROFILE_ID = "default";
export const DEFAULT_ASSISTANT_SYSTEM_PROMPT_ID = "runtime_default_profile";

const DEFAULT_OUTPUT_FORMATTING_SECTION =
  "Render final assistant answers as GitHub-flavored Markdown. Use bullet or numbered lists when the answer contains multiple items, preserve emphasis with Markdown syntax, and keep tool payload JSON out of the visible answer unless the user explicitly asks for raw data.";

export const createDefaultAssistantConfig = ({
  providerId,
  allowedModelIds,
  modelId,
  allowedToolNames,
  turnGuardIds,
}: {
  readonly providerId: string;
  readonly allowedModelIds?: readonly string[] | undefined;
  readonly modelId: string;
  readonly allowedToolNames: readonly string[];
  readonly turnGuardIds: readonly string[];
}): ServiceAssistantConfig => ({
  profileId: DEFAULT_ASSISTANT_PROFILE_ID,
  version: "2026-06-13",
  displayName: "Default assistant",
  prompt: {
    promptId: DEFAULT_ASSISTANT_SYSTEM_PROMPT_ID,
    sections: [{ id: "output_formatting", content: DEFAULT_OUTPUT_FORMATTING_SECTION }],
  },
  model: { providerId, modelId, allowedModelIds },
  toolPolicy:
    allowedToolNames.length > 0
      ? { mode: "profile_allowlist", allowedToolNames }
      : { mode: "closed", allowedToolNames: [] },
  safety: { policyId: "standard", promptInjectionMode: "standard", turnGuardIds },
});
