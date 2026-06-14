import type { HostCapabilityManifest } from "../contracts/capabilities.js";

export type ManifestTurnPolicyReferences = {
  readonly toolNames: ReadonlySet<string>;
  readonly commandNames: ReadonlySet<string>;
  readonly retrievalSourceIds: ReadonlySet<string>;
  readonly researchAgentIds: ReadonlySet<string>;
};

export const readManifestTurnPolicyReferences = (
  manifest: HostCapabilityManifest,
): ManifestTurnPolicyReferences => ({
  toolNames: new Set(manifest.tools.map((tool) => tool.name)),
  commandNames: new Set(manifest.commands.map((command) => command.commandName)),
  retrievalSourceIds: new Set(manifest.retrievalSources.map((source) => source.sourceId)),
  researchAgentIds: new Set(manifest.researchAgents.map((agent) => agent.researchAgentId)),
});

export const unknownManifestToolMessage = (toolName: string): string =>
  `Turn policy references unknown tool ${toolName}.`;

export const unknownManifestCommandMessage = (commandName: string): string =>
  `Turn policy references unknown host command ${commandName}.`;

export const unknownManifestRetrievalSourceMessage = (sourceId: string): string =>
  `Turn policy references unknown retrieval source ${sourceId}.`;

export const unknownManifestResearchAgentMessage = (researchAgentId: string): string =>
  `Turn policy references unknown research agent ${researchAgentId}.`;
