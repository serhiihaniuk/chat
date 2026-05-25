export type AgentRuntimeLayer = {
  readonly label: "agent-runtime";
};

export const createAgentRuntimeLayer = (): AgentRuntimeLayer => ({
  label: "agent-runtime",
});
