import { omitUndefinedProperties } from "@side-chat/shared";

import type { ServiceToolRegistration } from "#composition/tools/service-tool-registry";
import {
  MOCK_WEB_SEARCH_TOOL_NAME,
  createMockWebSearchRegistration,
} from "./mock-web-search-tool.js";

/**
 * Config-derived inputs a registration factory receives for one configured tool.
 *
 * These are the knobs `sidechat.config.ts` exposes per tool; a factory reads the
 * ones its tool needs (e.g. the mock uses `delayMs`) and ignores the rest.
 */
export type ConfiguredToolInput = {
  readonly description: string;
  readonly label: string;
  readonly defaultEnabled: boolean;
  readonly approvalPolicyIds: readonly string[];
  readonly delayMs?: number | undefined;
};

export type ToolRegistrationFactory = (input: ConfiguredToolInput) => ServiceToolRegistration;

/**
 * The service's config-driven tool registry: tool name -> registration factory.
 *
 * THIS is the place to add a config-driven tool. Adding one is three edits and no
 * more: write the tool file, add one entry here, add one `tools.availableTools`
 * entry in `sidechat.config.ts`. The config validator accepts exactly the names
 * present here, and the options adapter dispatches the configured name through
 * this map — neither needs editing. Tools that need injected dependencies (a
 * Jira/HTTP client, a secret) cannot be built from config alone; wire those
 * through `PartnerAiServiceOptions.runtime.tools` instead.
 */
export const DEFAULT_TOOL_REGISTRATIONS: Readonly<Record<string, ToolRegistrationFactory>> = {
  [MOCK_WEB_SEARCH_TOOL_NAME]: (input) =>
    createMockWebSearchRegistration(
      omitUndefinedProperties({
        description: input.description,
        label: input.label,
        defaultEnabled: input.defaultEnabled,
        approvalPolicyIds: input.approvalPolicyIds,
        delayMs: input.delayMs,
      }),
    ),
};

/** The tool names the config may reference, for validation and error messages. */
export const availableToolNames = (
  registrations: Readonly<Record<string, ToolRegistrationFactory>> = DEFAULT_TOOL_REGISTRATIONS,
): readonly string[] => Object.keys(registrations);

/** Look up a tool's registration factory by its configured name. */
export const findToolRegistrationFactory = (
  name: string,
  registrations: Readonly<Record<string, ToolRegistrationFactory>> = DEFAULT_TOOL_REGISTRATIONS,
): ToolRegistrationFactory | undefined =>
  Object.hasOwn(registrations, name) ? registrations[name] : undefined;
