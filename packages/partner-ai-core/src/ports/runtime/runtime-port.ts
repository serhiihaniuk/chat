import type { AgentRuntime } from "@side-chat/agent-runtime";

/**
 * Core's runtime port is the product boundary to the prepared-turn executor.
 *
 * Request, event, and stream contracts are owned by `agent-runtime`; core owns
 * only when to call the runtime and how returned RuntimeEvents become
 * browser-facing protocol events.
 */
export type AgentRuntimePort = Pick<AgentRuntime, "streamEffect">;
