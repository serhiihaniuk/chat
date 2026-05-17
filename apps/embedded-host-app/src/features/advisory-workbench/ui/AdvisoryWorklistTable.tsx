import { useMemo, useState } from "react";
import { Search, TriangleAlert } from "lucide-react";
import type { ICellRendererParams } from "ag-grid-community";
import type { HostGridFilter, HostGridSort } from "@side-chat/shared-protocol";

import type {
  AdvisoryDashboardSnapshot,
  ClientPortfolioReviewRow,
  TopRiskAccountRow,
} from "../model/advisory-dashboard.types.js";
import type { AdvisoryGridViewState } from "../model/grid-view-state.js";
import { DashboardGrid, type DashboardGridColumn } from "./DashboardGrid.js";
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
type DueStatus = "Overdue" | "Due soon" | "Open" | "No risk";

type AdvisoryWorklistRow = {
  id: string;
  sourceIds: string[];
  client: string;
  segment: string;
  aumChf: number;
  netFlow30dChf: number;
  riskProfile: string;
  riskScore: number;
  coverageStatus: ClientPortfolioReviewRow["coverageStatus"];
  relationshipManager: string;
  nextAction: string;
  hasAlert: boolean;
  riskIssue: string;
  riskExposureChf: number | null;
  priority: TopRiskAccountRow["priority"] | "None";
  dueDate: string;
  dueStatus: DueStatus;
};

const priorityRank: Record<AdvisoryWorklistRow["priority"], number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  None: 3,
};

const statusClass = (status: ClientPortfolioReviewRow["coverageStatus"]) =>
  status === "Covered" ? "covered" : status === "Watch" ? "watch" : "at-risk";
const columnLabels: Record<keyof AdvisoryWorklistRow, string> = {
  aumChf: "AUM",
  client: "Client",
  coverageStatus: "Coverage",
  dueDate: "Due Date",
  dueStatus: "Due Status",
  hasAlert: "Alert",
  id: "ID",
  netFlow30dChf: "30D Flow",
  nextAction: "Next Action",
  priority: "Priority",
  relationshipManager: "RM",
  riskExposureChf: "Exposure",
  riskIssue: "Risk / Task",
  riskProfile: "Risk Profile",
  riskScore: "Risk Score",
  segment: "Segment",
  sourceIds: "Sources",
};

export function AdvisoryWorklistTable({
  activeSourceId,
  snapshot,
  view,
}: AdvisoryWorklistTableProps) {
  const [quickFilterText, setQuickFilterText] = useState("");
  const rows = useMemo(() => createWorklistRows(snapshot), [snapshot]);
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
          headerName: "Risk / Task",
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
  const viewSummary = describeWorklistView(view);

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
      <div className="worklist-view-strip" key={view?.sequence ?? "default"}>
        <span className="view-strip-label">{viewSummary.label}</span>
        <div className="view-chip-list">
          {viewSummary.chips.map((chip) => (
            <span className="view-chip" key={chip}>
              {chip}
            </span>
          ))}
        </div>
      </div>
      <DashboardGrid
        activeSourceId={activeSourceId}
        columnDefs={columnDefs}
        defaultSort={[
          { colId: "priority", sort: "asc" },
          { colId: "dueDate", sort: "asc" },
          { colId: "netFlow30dChf", sort: "desc" },
        ]}
        getSourceId={(row) => `advisoryWorklist:${row.id}`}
        getSourceIds={(row) => row.sourceIds}
        fill
        quickFilterText={quickFilterText}
        resourceId="advisoryWorklist"
        rowData={rows}
        view={view}
      />
    </section>
  );
}

const describeWorklistView = (view: AdvisoryGridViewState | undefined) => {
  const sortChips = view?.sort?.map(describeSort) ?? [];
  const filterChips = view?.filters?.map(describeFilter) ?? [];
  const chips = [...filterChips, ...sortChips].filter(
    (chip): chip is string => Boolean(chip),
  );

  return chips.length > 0
    ? { label: "AI view", chips }
    : {
        label: "Default queue",
        chips: ["Priority first", "Earliest due date", "Largest outflow"],
      };
};

const describeSort = (sort: HostGridSort) => {
  const label = getColumnLabel(sort.columnId);
  const direction = sort.direction === "asc" ? "A-Z" : "Z-A";
  if (
    sort.columnId.toLowerCase().includes("date") ||
    sort.columnId.toLowerCase().includes("due")
  ) {
    return `${label}: ${sort.direction === "asc" ? "earliest first" : "latest first"}`;
  }
  if (
    sort.columnId.toLowerCase().includes("aum") ||
    sort.columnId.toLowerCase().includes("score") ||
    sort.columnId.toLowerCase().includes("flow") ||
    sort.columnId.toLowerCase().includes("exposure")
  ) {
    return `${label}: ${sort.direction === "asc" ? "low to high" : "high to low"}`;
  }
  return `${label}: ${direction}`;
};

const describeFilter = (filter: HostGridFilter) => {
  const label = getColumnLabel(filter.columnId);
  if (filter.operator === "blank") return `${label}: empty`;
  if (filter.operator === "notBlank") return `${label}: filled`;
  if (filter.operator === "contains") return `${label}: contains ${formatFilterValue(filter.value)}`;
  if (filter.operator === "equals") return `${label}: ${formatFilterValue(filter.value)}`;
  if (filter.operator === "greaterThan") return `${label}: > ${formatFilterValue(filter.value)}`;
  if (filter.operator === "greaterThanOrEqual") return `${label}: >= ${formatFilterValue(filter.value)}`;
  if (filter.operator === "lessThan") return `${label}: < ${formatFilterValue(filter.value)}`;
  if (filter.operator === "lessThanOrEqual") return `${label}: <= ${formatFilterValue(filter.value)}`;
  if (filter.operator === "between" && Array.isArray(filter.value)) {
    return `${label}: ${formatFilterValue(filter.value[0])} - ${formatFilterValue(filter.value[1])}`;
  }
  return `${label}: ${filter.operator}`;
};

const getColumnLabel = (columnId: string) =>
  columnLabels[columnId as keyof AdvisoryWorklistRow] ?? columnId;

const formatFilterValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(formatFilterValue).join(", ");
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value === undefined || value === null || value === "") return "any";
  return String(value);
};

const createWorklistRows = (
  snapshot: AdvisoryDashboardSnapshot,
): AdvisoryWorklistRow[] => {
  const riskByClient = new Map<string, TopRiskAccountRow[]>();
  for (const risk of snapshot.topRiskAccounts) {
    riskByClient.set(risk.clientId, [...(riskByClient.get(risk.clientId) ?? []), risk]);
  }

  return snapshot.clientPortfolioReview.map((client) => {
    const topRisk = [...(riskByClient.get(client.clientId) ?? [])].sort(
      (left, right) =>
        priorityRank[left.priority] - priorityRank[right.priority] ||
        left.dueDate.localeCompare(right.dueDate) ||
        right.exposureChf - left.exposureChf,
    )[0];

    const dueStatus = getDueStatus(topRisk?.dueDate, snapshot.asOfDate);

    return {
      id: client.id,
      sourceIds: [
        `advisoryWorklist:${client.id}`,
        `client_portfolio_review:${client.id}`,
        ...(topRisk ? [`top_risk_accounts:${topRisk.id}`] : []),
      ],
      client: client.client,
      segment: client.segment,
      aumChf: client.aumChf,
      netFlow30dChf: client.netFlow30dChf,
      riskProfile: client.riskProfile,
      riskScore: client.suitabilityScore,
      coverageStatus: client.coverageStatus,
      relationshipManager: client.relationshipManager,
      nextAction: client.nextAction,
      hasAlert: client.hasAlert,
      riskIssue: topRisk?.issue ?? "-",
      riskExposureChf: topRisk?.exposureChf ?? null,
      priority: topRisk?.priority ?? "None",
      dueDate: topRisk?.dueDate ?? "",
      dueStatus,
    };
  });
};

const getDueStatus = (
  dueDate: string | undefined,
  asOfDate: string,
): DueStatus => {
  if (!dueDate) return "No risk";
  const dueTime = toDateOnlyTime(dueDate);
  const asOfTime = toDateOnlyTime(asOfDate);
  if (dueTime === null || asOfTime === null) return "Open";
  if (dueTime <= asOfTime) return "Overdue";
  if (dueTime <= asOfTime + 7 * 24 * 60 * 60 * 1000) return "Due soon";
  return "Open";
};

const compareDateValues = (left: unknown, right: unknown) => {
  const leftTime = toDateOnlyTime(left);
  const rightTime = toDateOnlyTime(right);
  if (leftTime === null && rightTime === null) return 0;
  if (leftTime === null) return 1;
  if (rightTime === null) return -1;
  return leftTime - rightTime;
};

const compareFilterDate = (
  filterLocalDateAtMidnight: Date,
  cellValue: unknown,
) => {
  const filterTime = Date.UTC(
    filterLocalDateAtMidnight.getFullYear(),
    filterLocalDateAtMidnight.getMonth(),
    filterLocalDateAtMidnight.getDate(),
  );
  const cellTime = toDateOnlyTime(cellValue);
  if (cellTime === null) return 1;
  if (cellTime < filterTime) return -1;
  if (cellTime > filterTime) return 1;
  return 0;
};

const toDateOnlyTime = (value: unknown) => {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
};

const CoverageRenderer = ({
  value,
}: ICellRendererParams<AdvisoryWorklistRow, AdvisoryWorklistRow["coverageStatus"]>) => {
  const status = value ?? "Covered";
  return (
    <span className={`status-pill ${statusClass(status)}`}>
      <span aria-hidden="true" />
      {status}
    </span>
  );
};

const PriorityRenderer = ({
  value,
}: ICellRendererParams<AdvisoryWorklistRow, AdvisoryWorklistRow["priority"]>) => {
  const priority = value ?? "None";
  return priority === "None" ? (
    <span className="muted-dash">-</span>
  ) : (
    <span className={`priority priority-${priority.toLowerCase()}`}>
      {priority}
    </span>
  );
};

const DueStatusRenderer = ({
  value,
}: ICellRendererParams<AdvisoryWorklistRow, DueStatus>) => {
  const status = value ?? "Open";
  return <span className={`due-status ${statusToClassName(status)}`}>{status}</span>;
};

const AlertRenderer = ({
  value,
}: ICellRendererParams<AdvisoryWorklistRow, boolean>) =>
  value ? (
    <TriangleAlert className="alert-icon" size={18} aria-label="Alert" />
  ) : (
    <span className="muted-dash">-</span>
  );

const statusToClassName = (status: DueStatus) =>
  status.toLowerCase().replace(/\s+/g, "-");
