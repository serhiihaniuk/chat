import type {
  AdvisoryDashboardSnapshot,
  TopRiskAccountRow,
} from "@side-chat/db";
import type {
  HostGridViewState,
  WorkbenchSurfaceContextResult,
} from "#ports/index.js";
import type {
  WorkbenchWorklistRow,
  WorklistFilter,
  WorklistSortRule,
} from "./types.js";

export const surfaceResourceId = "advisoryWorklist";

const priorityRank: Record<WorkbenchWorklistRow["priority"], number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  None: 3,
};

const defaultWorklistSort = [
  { columnId: "priority", direction: "asc" as const },
  { columnId: "dueDate", direction: "asc" as const },
  { columnId: "netFlow30dChf", direction: "desc" as const },
];

export const createWorklistRows = (
  snapshot: AdvisoryDashboardSnapshot,
): WorkbenchWorklistRow[] => {
  const risksByClient = new Map<string, TopRiskAccountRow[]>();
  for (const risk of snapshot.topRiskAccounts) {
    risksByClient.set(risk.clientId, [
      ...(risksByClient.get(risk.clientId) ?? []),
      risk,
    ]);
  }

  return snapshot.clientPortfolioReview.map((client) => {
    const topRisk = [...(risksByClient.get(client.clientId) ?? [])].sort(
      (left, right) =>
        priorityRank[left.priority] - priorityRank[right.priority] ||
        left.dueDate.localeCompare(right.dueDate) ||
        right.exposureChf - left.exposureChf,
    )[0];

    return {
      id: client.id,
      client: client.client,
      segment: client.segment,
      aumChf: client.aumChf,
      netFlow30dChf: client.netFlow30dChf,
      coverageStatus: client.coverageStatus,
      riskProfile: client.riskProfile,
      riskScore: client.suitabilityScore,
      relationshipManager: client.relationshipManager,
      nextAction: client.nextAction,
      hasAlert: client.hasAlert,
      riskIssue: topRisk?.issue ?? "-",
      riskExposureChf: topRisk?.exposureChf ?? null,
      priority: topRisk?.priority ?? "None",
      dueDate: topRisk?.dueDate ?? "",
      dueStatus: getDueStatus(topRisk?.dueDate, snapshot.asOfDate),
    };
  });
};

const getDueStatus = (
  dueDate: string | undefined,
  asOfDate: string,
): WorkbenchWorklistRow["dueStatus"] => {
  if (!dueDate) return "No risk";
  const dueTime = toDateOnlyTime(dueDate);
  const asOfTime = toDateOnlyTime(asOfDate);
  if (dueTime === null || asOfTime === null) return "Open";
  if (dueTime <= asOfTime) return "Overdue";
  if (dueTime <= asOfTime + 7 * 24 * 60 * 60 * 1000) return "Due soon";
  return "Open";
};

const toDateOnlyTime = (value: unknown) => {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
};

const getWorklistValue = (
  row: WorkbenchWorklistRow,
  columnId: string,
): unknown =>
  columnId in row ? row[columnId as keyof WorkbenchWorklistRow] : undefined;

const normalizeComparableText = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

const isBlank = (value: unknown) =>
  value === undefined || value === null || value === "";

const valuesEqual = (left: unknown, right: unknown) => {
  if (typeof left === "number") return left === Number(right);
  if (typeof left === "boolean") {
    return left === /^(true|yes|1)$/i.test(String(right).trim());
  }
  return normalizeComparableText(left) === normalizeComparableText(right);
};

const compareDateValues = (left: unknown, right: unknown) => {
  const leftTime = toDateOnlyTime(left);
  const rightTime = toDateOnlyTime(right);
  if (leftTime === null && rightTime === null) return 0;
  if (leftTime === null) return 1;
  if (rightTime === null) return -1;
  return leftTime - rightTime;
};

const compareColumnValues = (
  left: unknown,
  right: unknown,
  columnId: string,
) => {
  if (columnId === "priority") {
    return (
      priorityRank[left as WorkbenchWorklistRow["priority"]] -
      priorityRank[right as WorkbenchWorklistRow["priority"]]
    );
  }
  if (columnId.toLowerCase().includes("date")) {
    return compareDateValues(left, right);
  }
  if (typeof left === "number" || typeof right === "number") {
    return (
      Number(left ?? Number.NEGATIVE_INFINITY) -
      Number(right ?? Number.NEGATIVE_INFINITY)
    );
  }
  return normalizeComparableText(left).localeCompare(
    normalizeComparableText(right),
  );
};

const compareFilterComparable = (
  left: unknown,
  right: unknown,
  columnId: string,
) => {
  if (columnId.toLowerCase().includes("date")) {
    const leftTime = toDateOnlyTime(left);
    const rightTime = toDateOnlyTime(right);
    if (leftTime === null || rightTime === null) return Number.NaN;
    return leftTime - rightTime;
  }

  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return normalizeComparableText(left).localeCompare(
    normalizeComparableText(right),
  );
};

const matchesWorklistFilter = (
  row: WorkbenchWorklistRow,
  filter: WorklistFilter,
) => {
  const value = getWorklistValue(row, filter.columnId);

  switch (filter.operator) {
    case "blank":
      return isBlank(value);
    case "notBlank":
      return !isBlank(value);
    case "in":
      return matchesAllowedFilter(value, filter.value);
    case "between":
      return matchesBetweenFilter(value, filter.value, filter.columnId);
    case "equals":
      return valuesEqual(value, filter.value);
    case "notEquals":
      return !valuesEqual(value, filter.value);
    case "contains":
      return normalizedText(value).includes(normalizedText(filter.value));
    case "startsWith":
      return normalizedText(value).startsWith(normalizedText(filter.value));
    case "endsWith":
      return normalizedText(value).endsWith(normalizedText(filter.value));
    case "greaterThan":
    case "greaterThanOrEqual":
    case "lessThan":
    case "lessThanOrEqual":
      return matchesComparisonFilter(value, filter);
  }
};

const normalizedText = (value: unknown) => normalizeComparableText(value);

const matchesAllowedFilter = (value: unknown, allowedValue: unknown) => {
  const allowed = Array.isArray(allowedValue) ? allowedValue : [allowedValue];
  return allowed.some((item) => valuesEqual(value, item));
};

const matchesBetweenFilter = (
  value: unknown,
  rangeValue: unknown,
  columnId: string,
) => {
  if (!Array.isArray(rangeValue)) return false;

  const [from, to] = rangeValue;
  return (
    compareFilterComparable(value, from, columnId) >= 0 &&
    compareFilterComparable(value, to, columnId) <= 0
  );
};

const matchesComparisonFilter = (value: unknown, filter: WorklistFilter) => {
  const comparison = compareFilterComparable(value, filter.value, filter.columnId);
  if (!Number.isFinite(comparison)) return false;
  if (filter.operator === "greaterThan") return comparison > 0;
  if (filter.operator === "greaterThanOrEqual") return comparison >= 0;
  if (filter.operator === "lessThan") return comparison < 0;
  if (filter.operator === "lessThanOrEqual") return comparison <= 0;
  return false;
};

const applyWorklistFilters = (
  rows: WorkbenchWorklistRow[],
  filters: HostGridViewState["filters"] | undefined,
) => {
  if (!filters || filters.length === 0) return [...rows];

  return rows.filter((row) =>
    filters.every((filter) => matchesWorklistFilter(row, filter)),
  );
};

const sortWorklistRows = (
  rows: WorkbenchWorklistRow[],
  sort: WorklistSortRule[],
) => {
  if (sort.length === 0) return rows;

  return [...rows].sort((left, right) => {
    for (const rule of sort) {
      const comparison = compareColumnValues(
        getWorklistValue(left, rule.columnId),
        getWorklistValue(right, rule.columnId),
        rule.columnId,
      );
      if (comparison !== 0) {
        return rule.direction === "asc" ? comparison : -comparison;
      }
    }
    return 0;
  });
};

export const applyWorklistView = (
  rows: WorkbenchWorklistRow[],
  view: HostGridViewState | undefined,
) => {
  const filtered = applyWorklistFilters(rows, view?.filters);
  const sort = view?.sort ?? defaultWorklistSort;
  return sortWorklistRows(filtered, sort);
};

/**
 * Converts backend-owned Portfolio Worklist rows plus remembered host view
 * state into the bounded current visible table context the model may use.
 */
export const createSurfaceContextResult = (
  workspaceId: string,
  rows: WorkbenchWorklistRow[],
  visibleRows: WorkbenchWorklistRow[],
  view: HostGridViewState | undefined,
  limit: number,
): WorkbenchSurfaceContextResult => {
  const sampledRows = visibleRows.slice(0, limit);
  return {
    resourceId: surfaceResourceId,
    label: "Portfolio Worklist",
    workspaceId,
    guidance: [
      "This is what the user currently sees on the page; when they ask what to do now, what needs attention, or what is present here, answer using this visible data.",
      "Use this context for questions about the current visible Portfolio Worklist view.",
      "It can answer how many rows are currently visible, which portfolio is first or most urgent in the current view, what filters and sorts are active, and what visible rows the user is looking at.",
      "Do not use this context as a full-dashboard ranking when the user asks about all portfolios; use the broader approved data lookup for whole-dashboard questions.",
    ],
    rowCount: visibleRows.length,
    totalRowCount: rows.length,
    filters: view?.filters,
    sort: view?.sort ?? defaultWorklistSort,
    rows: sampledRows.map((row) => ({
      id: row.id,
      label: row.client,
      sourceId: `${surfaceResourceId}:${row.id}`,
      cells: {
        client: row.client,
        segment: row.segment,
        priority: row.priority,
        riskIssue: row.riskIssue,
        dueDate: row.dueDate,
        dueStatus: row.dueStatus,
        aumChf: row.aumChf,
        netFlow30dChf: row.netFlow30dChf,
        coverageStatus: row.coverageStatus,
        relationshipManager: row.relationshipManager,
      },
    })),
    sources: sampledRows.map((row) => ({
      sourceId: `${surfaceResourceId}:${row.id}`,
      label: `Portfolio Worklist - ${row.client}`,
      dataset: "client_portfolio_review",
      resourceId: surfaceResourceId,
      rowId: row.id,
    })),
  };
};
