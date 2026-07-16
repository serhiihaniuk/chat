import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import {
  readWorkflowTools,
  WORKFLOW_CHAT_QUERY_SCOPE,
  type WorkflowChatClient,
  type WorkflowTool,
} from "#entities/workflow-chat";

/** One backend tool as the composer tools menu renders it, with live on/off state. */
export type WidgetToolToggle = {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly enabled: boolean;
};

export type WidgetToolSelection = {
  readonly tools: readonly WidgetToolToggle[];
  readonly toggleTool: (name: string) => void;
  readonly enabledToolNames: readonly string[] | undefined;
};

/**
 * Owns the composer tools-menu state: the backend tool catalog plus the user's
 * per-tool on/off overrides for the next turn.
 *
 * Each toggle seeds from the profile `defaultEnabled`; a user override flips it.
 * `enabledToolNames` is the per-turn selection sent on the request, which core
 * intersects with the turn profile allowlist — so toggling a tool off removes it
 * but can never grant one the profile disallows (the profile stays the upper
 * bound). It is undefined when no catalog is available, leaving the profile
 * default untouched for hosts without the tools endpoint; an empty array means
 * the user turned every catalog tool off.
 */
const WORKFLOW_TOOLS_QUERY = {
  RESOURCE: "tools",
} as const;

export const useWorkflowToolSelection = (client: WorkflowChatClient): WidgetToolSelection => {
  const toolCatalog = useQuery({
    queryKey: [WORKFLOW_CHAT_QUERY_SCOPE, WORKFLOW_TOOLS_QUERY.RESOURCE, client.baseUrl],
    queryFn: ({ signal }) => readWorkflowTools(client, signal),
  });
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const catalogTools = toolCatalog.data?.tools;
  const tools = useMemo<readonly WidgetToolToggle[]>(
    () => resolveToolToggles(catalogTools, overrides),
    [catalogTools, overrides],
  );
  const toggleTool = useCallback(
    (name: string) => setOverrides((current) => toggleToolOverride(catalogTools, current, name)),
    [catalogTools],
  );
  const enabledToolNames = useMemo<readonly string[] | undefined>(
    () => selectedToolNames(tools),
    [tools],
  );
  return { tools, toggleTool, enabledToolNames };
};

// The state below is pure so it can be unit-tested without React or the query
// client; the hook above is thin glue that the composer interaction test covers.

/** Seed each catalog tool's on/off state from its profile default, applying any user override. */
export const resolveToolToggles = (
  catalogTools: readonly WorkflowTool[] | undefined,
  overrides: Record<string, boolean>,
): readonly WidgetToolToggle[] =>
  (catalogTools ?? []).map((tool) => ({
    name: tool.name,
    label: tool.label,
    description: tool.description,
    enabled: overrides[tool.name] ?? tool.defaultEnabled,
  }));

/**
 * The per-turn `enabledToolNames` sent on the request: the enabled subset of the
 * resolved toggles, or undefined when there is no catalog (so a host without the
 * tools endpoint leaves the profile default untouched). An empty array means the
 * user turned every catalog tool off.
 */
export const selectedToolNames = (
  tools: readonly WidgetToolToggle[],
): readonly string[] | undefined =>
  tools.length === 0 ? undefined : tools.filter((tool) => tool.enabled).map((tool) => tool.name);

/** Flip one tool relative to its current resolved state; a no-op for an unknown name. */
export const toggleToolOverride = (
  catalogTools: readonly WorkflowTool[] | undefined,
  overrides: Record<string, boolean>,
  name: string,
): Record<string, boolean> => {
  const tool = catalogTools?.find((candidate) => candidate.name === name);
  if (!tool) return overrides;
  const enabled = overrides[name] ?? tool.defaultEnabled;
  return { ...overrides, [name]: !enabled };
};
