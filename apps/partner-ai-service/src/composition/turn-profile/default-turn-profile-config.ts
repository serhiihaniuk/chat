import {
  CONFIG_IDS,
  DEFAULT_OUTPUT_CONTRACT,
  SAFETY_POLICIES,
  TOOL_POLICY_MODES,
} from "#config/catalog/config-values";
import type { ServiceTurnProfileConfig } from "./turn-profile-registry.js";

/**
 * Built-in default turn profile, expressed as ordinary service config.
 *
 * The default prompt now lives here instead of inside manifest construction, so
 * local and adopter profiles build through the same registry path. Provider,
 * model, allowed tools, and guard ids are supplied by composition from the
 * provider, tool, and guard registries.
 */
export const DEFAULT_TURN_PROFILE_ID = CONFIG_IDS.TURN_PROFILES.DEFAULT;
export const DEFAULT_TURN_PROFILE_SYSTEM_PROMPT_ID = CONFIG_IDS.SYSTEM_PROMPTS.DEFAULT_TURN_PROFILE;

const DEFAULT_OUTPUT_FORMATTING_SECTION =
  "Render final assistant answers as GitHub-flavored Markdown. Use bullet or numbered lists when the answer contains multiple items, preserve emphasis with Markdown syntax, and keep tool payload JSON out of the visible answer unless the user explicitly asks for raw data.";

export const createDefaultTurnProfileConfig = ({
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
}): ServiceTurnProfileConfig => ({
  profileId: DEFAULT_TURN_PROFILE_ID,
  version: "2026-06-13",
  displayName: "Default profile",
  prompt: {
    promptId: DEFAULT_TURN_PROFILE_SYSTEM_PROMPT_ID,
    sections: [
      {
        id: CONFIG_IDS.PROMPT_SECTIONS.OUTPUT_FORMATTING,
        content: DEFAULT_OUTPUT_FORMATTING_SECTION,
      },
    ],
  },
  model: { providerId, modelId, allowedModelIds },
  outputContract: DEFAULT_OUTPUT_CONTRACT,
  toolPolicy:
    allowedToolNames.length > 0
      ? { mode: TOOL_POLICY_MODES.PROFILE_ALLOWLIST, allowedToolNames }
      : { mode: TOOL_POLICY_MODES.CLOSED, allowedToolNames: [] },
  safety: {
    policyId: SAFETY_POLICIES.STANDARD.ID,
    promptInjectionMode: SAFETY_POLICIES.STANDARD.DEFAULT_PROMPT_INJECTION_MODE,
    turnGuardIds,
  },
});
