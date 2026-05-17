import type {
  HostCommand,
  HostGridFilter,
  HostGridSort,
} from "@side-chat/shared-protocol";

export type AdvisoryGridResourceId =
  "advisoryWorklist";

export type AdvisoryGridViewState = {
  filters?: HostGridFilter[];
  sort?: HostGridSort[];
  highlightRowIds?: string[];
  sequence: number;
};

export type AdvisoryGridViews = Partial<
  Record<AdvisoryGridResourceId, AdvisoryGridViewState>
>;

export const advisoryGridResourceIds = [
  "advisoryWorklist",
] as const satisfies AdvisoryGridResourceId[];

export const isAdvisoryGridResourceId = (
  value: string,
): value is AdvisoryGridResourceId =>
  advisoryGridResourceIds.some((resourceId) => resourceId === value);

/**
 * Pure host-command reducer. The assistant can request grid views, but this
 * host app decides how those commands affect local table state.
 */
export const reduceGridViews = (
  current: AdvisoryGridViews,
  command: HostCommand,
): AdvisoryGridViews => {
  if (
    command.type !== "grid.applyView" &&
    command.type !== "grid.clearView"
  ) {
    return current;
  }

  if (!isAdvisoryGridResourceId(command.resourceId)) {
    return current;
  }

  if (command.type === "grid.clearView") {
    const { [command.resourceId]: _removed, ...rest } = current;
    return rest;
  }

  return {
    ...current,
    [command.resourceId]: {
      filters: command.view.filters,
      sort: command.view.sort,
      highlightRowIds: command.view.highlightRowIds,
      sequence: (current[command.resourceId]?.sequence ?? 0) + 1,
    },
  };
};
