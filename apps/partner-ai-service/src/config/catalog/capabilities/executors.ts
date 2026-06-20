import { DEFAULT_AGENT_EXECUTOR_ID } from "@side-chat/agent-runtime";

/**
 * Runtime executors that service config can select.
 *
 * The executable implementation is registered by `agent-runtime`; this catalog
 * gives readable config a stable importable descriptor instead of a bare
 * executor id string.
 */
export const EXECUTORS = {
  AI_SDK_TOOL_LOOP: {
    EXECUTOR_ID: DEFAULT_AGENT_EXECUTOR_ID,
    LABEL: "AI SDK tool loop",
    DESCRIPTION: "Streams one prepared turn through the AI SDK tool-loop executor.",
  },
} as const;
