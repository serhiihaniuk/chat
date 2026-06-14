import type { HostCapabilityManifest } from "../contracts/capabilities.js";

export type ManifestTurnPolicyReferences = {
  readonly toolNames: ReadonlySet<string>;
  readonly commandNames: ReadonlySet<string>;
  readonly retrievalSourceIds: ReadonlySet<string>;
  readonly workflowIds: ReadonlySet<string>;
};

export const readManifestTurnPolicyReferences = (
  manifest: HostCapabilityManifest,
): ManifestTurnPolicyReferences => ({
  toolNames: new Set(manifest.tools.map((tool) => tool.name)),
  commandNames: new Set(manifest.commands.map((command) => command.commandName)),
  retrievalSourceIds: new Set(manifest.retrievalSources.map((source) => source.sourceId)),
  workflowIds: new Set(manifest.workflows.map((workflow) => workflow.workflowId)),
});

export const unknownManifestToolMessage = (toolName: string): string =>
  `Turn policy references unknown tool ${toolName}.`;

export const unknownManifestCommandMessage = (commandName: string): string =>
  `Turn policy references unknown host command ${commandName}.`;

export const unknownManifestRetrievalSourceMessage = (sourceId: string): string =>
  `Turn policy references unknown retrieval source ${sourceId}.`;

export const unknownManifestWorkflowMessage = (workflowId: string): string =>
  `Turn policy references unknown workflow ${workflowId}.`;
