import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import type { AdvisoryDashboardSnapshot } from "../model/advisory-dashboard.types.js";
import type { AdvisoryGridViewState } from "../model/grid-view-state.js";
import {
  compareDateValues,
  compareFilterDate,
  createWorklistRows,
  priorityRank,
  type AdvisoryWorklistRow,
} from "../model/worklist-model.js";
import { DashboardGrid, type DashboardGridColumn } from "./DashboardGrid.js";
import {
  AlertRenderer,
  CoverageRenderer,
  DueStatusRenderer,
  PriorityRenderer,
} from "./advisory-worklist-table/worklist-renderers.js";
import { formatChfCompact, formatSignedChfCompact } from "./formatters.js";

type AdvisoryWorklistTableProps = {
  activeSourceId?: string | null;
  snapshot: AdvisoryDashboardSnapshot;
  view?: AdvisoryGridViewState;
};

/**
 * Visible Portfolio Worklist. It merges client-review and risk rows into one
 * commandable grid so host commands can filter/sort/highlight a real surface.
 */
export function AdvisoryWorklistTable({
  activeSourceId,
  snapshot,
  view,
}: AdvisoryWorklistTableProps) {
  const [quickFilterText, setQuickFilterText] = useState("");
  const rows = useMemo(
    () =>
      createWorklistRows(snapshot)
        .sort(
          (left, right) =>
            priorityRank[left.priority] - priorityRank[right.priority] ||
            compareDateValues(left.dueDate, right.dueDate) ||
            left.client.localeCompare(right.client),
        ),
    [snapshot],
  );
  const columnDefs = useMemo(
    () =>
      [
        {
          field: "client",
          headerName: "Client",
          minWidth: 210,
          pinned: "left",
          cellClass: "client-name",
          filterKind: "text",
        },
        { field: "segment", headerName: "Segment", minWidth: 105 },
        {
          field: "priority",
          headerName: "Priority",
          minWidth: 96,
          comparator: (left, right) =>
            priorityRank[left as AdvisoryWorklistRow["priority"]] -
            priorityRank[right as AdvisoryWorklistRow["priority"]],
          cellRenderer: PriorityRenderer,
        },
        {
          field: "riskIssue",
          headerName: "Risk / Issue",
          minWidth: 210,
          flex: 1,
        },
        {
          field: "dueDate",
          headerName: "Due",
          filterKind: "date",
          comparator: compareDateValues,
          filterParams: {
            comparator: compareFilterDate,
          },
          minWidth: 112,
        },
        {
          field: "dueStatus",
          headerName: "Status",
          minWidth: 104,
          cellRenderer: DueStatusRenderer,
        },
        {
          field: "aumChf",
          headerName: "AUM",
          filterKind: "number",
          minWidth: 108,
          type: "rightAligned",
          valueFormatter: ({ value }) => formatChfCompact(Number(value)),
        },
        {
          field: "netFlow30dChf",
          headerName: "30D Flow",
          filterKind: "number",
          minWidth: 112,
          type: "rightAligned",
          cellClass: ({ value }) =>
            `money-flow ${Number(value) < 0 ? "negative" : "positive"}`,
          valueFormatter: ({ value }) => formatSignedChfCompact(Number(value)),
        },
        {
          field: "riskScore",
          headerName: "Risk Score",
          hide: true,
          filterKind: "number",
          minWidth: 125,
          type: "rightAligned",
        },
        {
          field: "coverageStatus",
          headerName: "Coverage",
          hide: true,
          minWidth: 145,
          cellRenderer: CoverageRenderer,
        },
        {
          field: "riskExposureChf",
          headerName: "Exposure",
          hide: true,
          filterKind: "number",
          minWidth: 130,
          type: "rightAligned",
          valueFormatter: ({ value }) =>
            typeof value === "number" ? formatChfCompact(value) : "-",
        },
        {
          field: "relationshipManager",
          headerName: "RM",
          minWidth: 88,
        },
        {
          field: "nextAction",
          headerName: "Next Action",
          hide: true,
          minWidth: 180,
        },
        {
          field: "hasAlert",
          headerName: "Alert",
          hide: true,
          filterKind: "boolean",
          minWidth: 95,
          cellRenderer: AlertRenderer,
        },
      ] satisfies DashboardGridColumn<AdvisoryWorklistRow>[],
    [],
  );

  return (
    <section className="table-card super-table-card">
      <div className="table-card-header worklist-header">
        <div className="section-title-row">
          <h2>Portfolio Worklist</h2>
          <span className="result-badge">{rows.length} rows</span>
        </div>
        <div className="table-tools">
          <label className="search-field">
            <Search size={18} />
            <span className="sr-only">Search portfolio worklist</span>
            <input
              type="search"
              placeholder="Search client, RM, risk, action..."
              value={quickFilterText}
              onChange={(event) => setQuickFilterText(event.currentTarget.value)}
            />
          </label>
        </div>
      </div>
      <DashboardGrid
        activeSourceId={activeSourceId}
        columnDefs={columnDefs}
        compact
        getSourceId={(row) => `advisoryWorklist:${row.id}`}
        getSourceIds={(row) => row.sourceIds}
        fill
        quickFilterText={quickFilterText}
        resourceId="advisoryWorklist"
        resultLabel={({ displayedRows, rowDataLength }) =>
          displayedRows > 0
            ? `Showing 1-${Math.min(8, displayedRows)} of ${rowDataLength} rows`
            : `Showing 0 of ${rowDataLength} rows`
        }
        rowData={rows}
        showSimplePagination
        view={view}
      />
    </section>
  );
}
