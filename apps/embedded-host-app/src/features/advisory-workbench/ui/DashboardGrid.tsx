import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type FilterModel,
  type GridApi,
  type GridReadyEvent,
  type ICellRendererParams,
} from "ag-grid-community";
import type { HostGridFilter } from "@side-chat/shared-protocol";

import type {
  AdvisoryGridResourceId,
  AdvisoryGridViewState,
} from "../model/grid-view-state.js";

ModuleRegistry.registerModules([AllCommunityModule]);

export type DashboardGridColumn<TData> = ColDef<TData> & {
  field: keyof TData & string;
  filterKind?: "text" | "number" | "date" | "boolean";
};

type DashboardGridProps<TData extends { id: string }> = {
  activeSourceId?: string | null;
  className?: string;
  columnDefs: DashboardGridColumn<TData>[];
  compact?: boolean;
  defaultSort?: Array<{ colId: string; sort: "asc" | "desc" }>;
  fill?: boolean;
  getSourceId: (row: TData) => string;
  getSourceIds?: (row: TData) => string[];
  height?: number;
  quickFilterText?: string;
  resourceId: AdvisoryGridResourceId;
  rowData: TData[];
  view?: AdvisoryGridViewState;
};

const createFilterModel = <TData,>(
  filters: HostGridFilter[] | undefined,
  columnDefs: DashboardGridColumn<TData>[],
): FilterModel => {
  const columns = new Map<string, DashboardGridColumn<TData>>(
    columnDefs.map((column) => [column.field, column]),
  );
  const model: FilterModel = {};

  for (const filter of filters ?? []) {
    const column = columns.get(filter.columnId);
    if (!column) continue;

    const filterKind = column.filterKind ?? "text";
    if (filterKind === "number") {
      model[filter.columnId] = createNumberFilter(filter);
      continue;
    }

    if (filterKind === "date") {
      model[filter.columnId] = createDateFilter(filter);
      continue;
    }

    if (filterKind === "boolean") {
      model[filter.columnId] =
        filter.operator === "blank" || filter.operator === "notBlank"
          ? createBlankFilter(filter, "text")
          : {
              filterType: "text",
              type: "equals",
              filter: String(filter.value),
            };
      continue;
    }

    model[filter.columnId] = createTextFilter(filter);
  }

  return model;
};

const createTextFilter = (filter: HostGridFilter) => ({
  filterType: "text",
  type:
    filter.operator === "blank" || filter.operator === "notBlank"
      ? filter.operator
      : filter.operator === "notEquals"
      ? "notEqual"
      : filter.operator === "startsWith" ||
          filter.operator === "endsWith" ||
          filter.operator === "equals"
        ? filter.operator
        : "contains",
  filter: String(filter.value ?? ""),
});

const createBlankFilter = (filter: HostGridFilter, filterType: string) => ({
  filterType,
  type: filter.operator,
});

const createNumberFilter = (filter: HostGridFilter) => {
  if (filter.operator === "blank" || filter.operator === "notBlank") {
    return createBlankFilter(filter, "number");
  }

  if (
    filter.operator === "between" &&
    Array.isArray(filter.value) &&
    filter.value.length >= 2
  ) {
    return {
      filterType: "number",
      type: "inRange",
      filter: Number(filter.value[0]),
      filterTo: Number(filter.value[1]),
    };
  }

  return {
    filterType: "number",
    type: mapComparableOperator(filter.operator),
    filter: Number(filter.value ?? 0),
  };
};

const createDateFilter = (filter: HostGridFilter) =>
  filter.operator === "blank" || filter.operator === "notBlank"
    ? createBlankFilter(filter, "date")
    : {
        filterType: "date",
        type: mapComparableOperator(filter.operator),
        dateFrom: String(filter.value ?? ""),
      };

const mapComparableOperator = (operator: HostGridFilter["operator"]) => {
  if (operator === "greaterThan") return "greaterThan";
  if (operator === "greaterThanOrEqual") return "greaterThanOrEqual";
  if (operator === "lessThan") return "lessThan";
  if (operator === "lessThanOrEqual") return "lessThanOrEqual";
  if (operator === "notEquals") return "notEqual";
  if (operator === "blank" || operator === "notBlank") return operator;
  return "equals";
};

const defaultColDef = {
  filter: true,
  floatingFilter: false,
  resizable: true,
  sortable: true,
  suppressHeaderFilterButton: true,
  suppressHeaderMenuButton: true,
} satisfies ColDef;

export function DashboardGrid<TData extends { id: string }>({
  activeSourceId,
  className,
  columnDefs,
  compact = false,
  defaultSort,
  fill = false,
  getSourceId,
  getSourceIds,
  height = 420,
  quickFilterText,
  resourceId,
  rowData,
  view,
}: DashboardGridProps<TData>) {
  const apiRef = useRef<GridApi<TData> | null>(null);
  const [displayedRows, setDisplayedRows] = useState(rowData.length);
  const readSourceIds = useCallback(
    (row: TData) => getSourceIds?.(row) ?? [getSourceId(row)],
    [getSourceId, getSourceIds],
  );

  const agColumnDefs = useMemo(
    () =>
      columnDefs.map(({ filterKind, ...column }) => ({
        ...column,
        filter: resolveFilter(filterKind),
      })),
    [columnDefs],
  );

  const refreshDisplayedRows = () => {
    const api = apiRef.current;
    if (!api) return;
    setDisplayedRows(api.getDisplayedRowCount());
  };

  const onGridReady = (event: GridReadyEvent<TData>) => {
    apiRef.current = event.api;
    applyView(event.api, columnDefs, view, defaultSort);
    refreshDisplayedRows();
  };

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;

    applyView(api, columnDefs, view, defaultSort);
    refreshDisplayedRows();
  }, [columnDefs, defaultSort, view]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !activeSourceId) return;

    let matchingRowId: string | undefined;
    api.forEachNodeAfterFilterAndSort((node) => {
      if (matchingRowId || !node.data) return;
      if (readSourceIds(node.data).includes(activeSourceId)) {
        matchingRowId = node.id;
      }
    });

    const node = matchingRowId ? api.getRowNode(matchingRowId) : undefined;
    if (node) api.ensureNodeVisible(node, "middle");
    api.redrawRows();
  }, [activeSourceId, readSourceIds]);

  useEffect(() => {
    apiRef.current?.redrawRows();
  }, [view?.highlightRowIds]);

  useEffect(() => {
    apiRef.current?.setGridOption("quickFilterText", quickFilterText ?? "");
  }, [quickFilterText]);

  const gridHeight = fill ? "100%" : height;

  return (
    <div
      className={`dashboard-grid ag-theme-quartz${compact ? " is-compact" : ""}${
        fill ? " is-fill" : ""
      }${className ? ` ${className}` : ""}`}
      data-host-resource-id={resourceId}
      style={{ minHeight: compact ? 340 : fill ? 0 : height, height: gridHeight }}
    >
      <div className="dashboard-grid-body">
        <AgGridReact<TData>
          columnDefs={agColumnDefs}
          defaultColDef={defaultColDef}
          getRowClass={(params) => {
            const row = params.data;
            if (!row) return "";
            const sourceIds = readSourceIds(row);
            const highlighted =
              Boolean(activeSourceId && sourceIds.includes(activeSourceId)) ||
              view?.highlightRowIds?.includes(row.id);
            return highlighted ? "citation-active" : "";
          }}
          getRowId={(params) => params.data.id}
          onFilterChanged={refreshDisplayedRows}
          onGridReady={onGridReady}
          onModelUpdated={refreshDisplayedRows}
          onSortChanged={refreshDisplayedRows}
          rowData={rowData}
          rowHeight={compact ? 40 : 42}
          suppressCellFocus
          suppressMovableColumns
          theme="legacy"
        />
      </div>
      <div className="grid-result-line">
        Showing {displayedRows} of {rowData.length} rows
      </div>
    </div>
  );
}

const resolveFilter = (
  filterKind: DashboardGridColumn<unknown>["filterKind"],
) => {
  if (filterKind === "number") return "agNumberColumnFilter";
  if (filterKind === "date") return "agDateColumnFilter";
  if (filterKind === "boolean") return "agTextColumnFilter";
  return "agTextColumnFilter";
};

const applyView = <TData,>(
  api: GridApi<TData>,
  columnDefs: DashboardGridColumn<TData>[],
  view: AdvisoryGridViewState | undefined,
  defaultSort: Array<{ colId: string; sort: "asc" | "desc" }> | undefined,
) => {
  api.setFilterModel(createFilterModel(view?.filters, columnDefs));
  api.applyColumnState({
    defaultState: { sort: null },
    state:
      view?.sort?.map((sort) => ({
        colId: sort.columnId,
        sort: sort.direction,
      })) ??
      defaultSort ??
      [],
  });
};

export const yesNoFormatter = ({ value }: ICellRendererParams) =>
  value ? "Yes" : "No";
