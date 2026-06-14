import type { AgentRuntime } from "@side-chat/agent-runtime";

/**
 * The part of agent-runtime that core calls after a turn is prepared.
 *
 * Core decides when to start streaming and how returned events become browser
 * events. agent-runtime owns the model/provider work.
 */
export type AgentRuntimePort = Pick<AgentRuntime, "streamEffect">;
