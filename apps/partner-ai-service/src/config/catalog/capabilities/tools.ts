import {
  DEFAULT_MOCK_WEB_SEARCH_AGENT_PROMPT,
  DEFAULT_MOCK_WEB_SEARCH_DELAY_MS,
  DEFAULT_MOCK_WEB_SEARCH_MODEL_ID,
  DEFAULT_MOCK_WEB_SEARCH_RESULT_COUNT,
  MOCK_WEB_SEARCH_INPUT_SCHEMA,
  MOCK_WEB_SEARCH_TOOL_DESCRIPTION,
  MOCK_WEB_SEARCH_TOOL_LABEL,
  MOCK_WEB_SEARCH_TOOL_NAME,
} from "#adapters/tools/mock-web-search-tool";
import { TOOL_DEFAULT_EXPOSURE } from "../config-values.js";

/**
 * Built-in service tool descriptors available to readable config.
 *
 * Tool adapters still own execution. This catalog exposes the stable tool name,
 * model-facing usage text, input contract, and safe default parameters so a
 * config reader can see what enabling the tool means.
 */
export const TOOLS = {
  MOCK_WEB_SEARCH: {
    NAME: MOCK_WEB_SEARCH_TOOL_NAME,
    LABEL: MOCK_WEB_SEARCH_TOOL_LABEL,
    DESCRIPTION: MOCK_WEB_SEARCH_TOOL_DESCRIPTION,
    INPUT_SCHEMA: MOCK_WEB_SEARCH_INPUT_SCHEMA,
    MODEL_PROMPT: {
      USAGE_INSTRUCTIONS: MOCK_WEB_SEARCH_TOOL_DESCRIPTION,
    },
    PARAMETERS: {
      DEFAULT_DELAY_MS: DEFAULT_MOCK_WEB_SEARCH_DELAY_MS,
      DEFAULT_RESULT_COUNT: DEFAULT_MOCK_WEB_SEARCH_RESULT_COUNT,
      DEFAULT_SEARCH_MODEL_ID: DEFAULT_MOCK_WEB_SEARCH_MODEL_ID,
      DEFAULT_SEARCH_AGENT_PROMPT: DEFAULT_MOCK_WEB_SEARCH_AGENT_PROMPT,
    },
    EXPOSURE: {
      DEFAULT_MODE: TOOL_DEFAULT_EXPOSURE.ENABLED,
      APPROVAL_POLICY_IDS: [],
    },
  },
} as const;
