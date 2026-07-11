export const CLIENT_TOOL_CATALOG_LIMITS = Object.freeze({
  MAX_TOOLS: 16,
  MAX_NAME_LENGTH: 64,
  MAX_DESCRIPTION_LENGTH: 1_024,
  MAX_SCHEMA_BYTES: 16_384,
  MAX_SCHEMA_DEPTH: 16,
  MAX_SCHEMA_NODES: 256,
} as const);

export type ClientToolDefinition = Readonly<{
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
}>;

/**
 * Check untrusted browser names before they enter the server's tool set. The
 * resulting set must keep one meaning per name: no duplicate browser entry and
 * no browser entry that shadows a server-owned tool.
 */
export function hasClientToolNameConflict(
  clientTools: readonly ClientToolDefinition[],
  serverToolNames: ReadonlySet<string> = new Set(),
): boolean {
  const occupiedNames = new Set(serverToolNames);
  for (const clientTool of clientTools) {
    if (occupiedNames.has(clientTool.name)) return true;
    occupiedNames.add(clientTool.name);
  }
  return false;
}
