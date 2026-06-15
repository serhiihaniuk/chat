import type { HostCapabilityManifest } from "../contracts/capabilities.js";

export type ManifestTurnPolicyReferences = {
  readonly toolNames: ReadonlySet<string>;
  readonly commandNames: ReadonlySet<string>;
};

export const readManifestTurnPolicyReferences = (
  manifest: HostCapabilityManifest,
): ManifestTurnPolicyReferences => ({
  toolNames: new Set(manifest.tools.map((tool) => tool.name)),
  commandNames: new Set(manifest.commands.map((command) => command.commandName)),
});

export const unknownManifestToolMessage = (toolName: string): string =>
  `Turn policy references unknown tool ${toolName}.`;

export const unknownManifestCommandMessage = (commandName: string): string =>
  `Turn policy references unknown host command ${commandName}.`;
