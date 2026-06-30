import { useCallback, useMemo, useState } from "react";

import {
  useGetToolCatalog,
  type SideChatApiClient,
  type ToolCatalogOption,
} from "#entities/conversation";

type WidgetToolSelectionInput = {
  readonly client: SideChatApiClient;
};

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
 * per-tool on/off overrides for the next turn. Mirrors useWidgetModelSelection.
 *
 * Each toggle seeds from the profile `defaultEnabled`; a user override flips it.
 * `enabledToolNames` is the per-turn selection sent on the request, which core
 * intersects with the turn profile allowlist — so toggling a tool off removes it
 * but can never grant one the profile disallows (the profile stays the upper
 * bound). It is undefined when no catalog is available, leaving the profile
 * default untouched for hosts without the tools endpoint; an empty array means
 * the user turned every catalog tool off.
 */
export const useWidgetToolSelection = ({
  client,
}: WidgetToolSelectionInput): WidgetToolSelection => {
  const toolCatalog = useGetToolCatalog({ client });
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const catalogTools = toolCatalog.data?.tools;
  const tools = useMemo<readonly WidgetToolToggle[]>(
    () => resolveToolToggles(catalogTools, overrides),
    [catalogTools, overrides],
  );

  const toggleTool = useCallback(
    (name: string) => {
      setOverrides((current) => {
        const tool = catalogTools?.find((candidate) => candidate.name === name);
        if (!tool) return current;
        const enabled = current[name] ?? tool.defaultEnabled;
        return { ...current, [name]: !enabled };
      });
    },
    [catalogTools],
  );

  const enabledToolNames = useMemo<readonly string[] | undefined>(
    () =>
      tools.length === 0
        ? undefined
        : tools.filter((tool) => tool.enabled).map((tool) => tool.name),
    [tools],
  );

  return { tools, toggleTool, enabledToolNames };
};

const resolveToolToggles = (
  catalogTools: readonly ToolCatalogOption[] | undefined,
  overrides: Record<string, boolean>,
): readonly WidgetToolToggle[] =>
  (catalogTools ?? []).map((tool) => ({
    name: tool.name,
    label: tool.label,
    description: tool.description,
    enabled: overrides[tool.name] ?? tool.defaultEnabled,
  }));
