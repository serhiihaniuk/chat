/**
 * Dev-fixture cycle-break for the mock web search sub-agent.
 *
 * The mock tool's registration is built in the config/options layer, before the
 * AgentRuntime exists (the runtime is built FROM the tools, so a tool cannot
 * capture the runtime at build time). Composition sets this handle right after it
 * builds the runtime; the tool reads it at request time to run its search
 * sub-agent, and falls back to a deterministic canned result whenever it is unset.
 *
 * This is a single-instance, dev-only seam — the mock tool is itself a local
 * fixture. A production tool that needs a model would be injected through
 * `PartnerAiServiceOptions.runtime.tools` with an explicit dependency instead.
 */
import type { AgentRuntime } from "@side-chat/agent-runtime";

const holder: { runtime: AgentRuntime | undefined } = { runtime: undefined };

export const setMockWebSearchRuntime = (runtime: AgentRuntime | undefined): void => {
  holder.runtime = runtime;
};

export const getMockWebSearchRuntime = (): AgentRuntime | undefined => holder.runtime;
