import { createToolRegistry, type ToolRegistry } from "#tools/tool-registry";
import type { RuntimeTool } from "#tools/runtime-tool";

export type ToolCatalog = ToolRegistry;

export const createToolCatalog = (tools: readonly RuntimeTool[] | undefined): ToolCatalog =>
  createToolRegistry(tools ?? []);

/**
 * Select the exact tools the model can see for one assistant turn.
 *
 * Source registration alone is not permission. Core passes the final per-turn
 * tool-name list, and runtime resolves only those app-owned executables.
 */
export const selectRuntimeToolsByName = (
  registry: ToolRegistry,
  selectedNames: readonly string[],
): readonly RuntimeTool[] => selectedNames.map((name) => registry.resolve(name));
