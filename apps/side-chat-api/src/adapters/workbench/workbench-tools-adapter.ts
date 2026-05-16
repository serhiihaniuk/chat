import {
  createPostgresAdvisoryDashboardDb,
  type AdvisoryDashboardSnapshot,
  type ClientPortfolioReviewRow,
  type TopRiskAccountRow,
} from "@side-chat/db";

import type {
  HostGridViewState,
  HostSurfaceStatePort,
  WorkbenchCitationSource,
  WorkbenchQueryName,
  WorkbenchSurfaceContextResult,
  WorkbenchToolsPort,
} from "#ports/index.js";

/**
 * Workbench tools adapter. It translates dashboard data and host table state
 * into model-usable query results and citation sources through backend ports.
 */
type ClientPortfolioReviewToolRow = {
  id: string;
  clientId?: string;
  client: string;
  segment?: string;
  aumChf: number;
  netFlow30dChf?: number;
  coverageStatus: string;
  riskProfile: string;
  suitabilityScore?: number;
  lastReview?: string;
  relationshipManager?: string;
  nextAction: string;
  hasAlert: boolean;
};

type TopRiskAccountToolRow = {
  id: string;
  clientId?: string;
  client: string;
  issue: string;
  exposureChf?: number;
  priority: "High" | "Medium" | "Low";
  owner?: string;
  dueDate?: string;
};

const clientPortfolioReviewFallback: ClientPortfolioReviewToolRow[] = [
  {
    id: "review-ackermann-family-office",
    clientId: "client-ackermann-family-office",
    client: "Ackermann Family Office",
    segment: "UHNW",
    aumChf: 3_428_000_000,
    coverageStatus: "Covered",
    riskProfile: "Balanced",
    relationshipManager: "S. Meier",
    nextAction: "Portfolio review",
    hasAlert: false,
  },
  {
    id: "review-bauhaus-enterprises-ag",
    clientId: "client-bauhaus-enterprises-ag",
    client: "Bauhaus Enterprises AG",
    segment: "Corporate",
    aumChf: 1_980_000_000,
    coverageStatus: "Covered",
    riskProfile: "Moderate",
    relationshipManager: "M. Keller",
    nextAction: "Cash sweep",
    hasAlert: false,
  },
  {
    id: "review-chen-private-wealth",
    clientId: "client-chen-private-wealth",
    client: "Chen Private Wealth",
    segment: "HNW",
    aumChf: 1_450_000_000,
    coverageStatus: "Watch",
    riskProfile: "Growth",
    relationshipManager: "L. Rossi",
    nextAction: "Rebalance",
    hasAlert: true,
  },
  {
    id: "review-delaunay-holdings",
    clientId: "client-delaunay-holdings",
    client: "Delaunay Holdings",
    segment: "Corporate",
    aumChf: 1_210_000_000,
    coverageStatus: "Watch",
    riskProfile: "Balanced",
    relationshipManager: "T. Nguyen",
    nextAction: "Derivatives review",
    hasAlert: false,
  },
  {
    id: "review-equinox-partners-llp",
    clientId: "client-equinox-partners-llp",
    client: "Equinox Partners LLP",
    segment: "Institutional",
    aumChf: 982_000_000,
    coverageStatus: "Covered",
    riskProfile: "Moderate",
    relationshipManager: "A. Patel",
    nextAction: "Performance update",
    hasAlert: false,
  },
  {
    id: "review-global-medtech-inc",
    clientId: "client-global-medtech-inc",
    client: "Global MedTech Inc.",
    segment: "Corporate",
    aumChf: 654_000_000,
    coverageStatus: "At Risk",
    riskProfile: "Balanced",
    relationshipManager: "R. Li",
    nextAction: "Liquidity plan",
    hasAlert: true,
  },
  {
    id: "review-jasper-retail-group",
    clientId: "client-jasper-retail-group",
    client: "Jasper Retail Group",
    segment: "Corporate",
    aumChf: 487_000_000,
    coverageStatus: "At Risk",
    riskProfile: "Moderate",
    relationshipManager: "J. Colombo",
    nextAction: "Credit review",
    hasAlert: true,
  },
];

const topRiskAccountsFallback: TopRiskAccountToolRow[] = [
  {
    id: "risk-global-medtech-liquidity-gap",
    clientId: "client-global-medtech-inc",
    client: "Global MedTech Inc.",
    issue: "Liquidity gap",
    exposureChf: 112_000_000,
    priority: "High",
    owner: "R. Li",
    dueDate: "2025-07-08",
  },
  {
    id: "risk-jasper-credit-concentration",
    clientId: "client-jasper-retail-group",
    client: "Jasper Retail Group",
    issue: "Credit concentration",
    exposureChf: 78_000_000,
    priority: "High",
    owner: "J. Colombo",
    dueDate: "2025-07-04",
  },
  {
    id: "risk-delaunay-margin-utilization",
    clientId: "client-delaunay-holdings",
    client: "Delaunay Holdings",
    issue: "Margin utilization",
    exposureChf: 64_000_000,
    priority: "Medium",
    owner: "T. Nguyen",
    dueDate: "2025-07-10",
  },
  {
    id: "risk-equinox-covenant-breach",
    clientId: "client-equinox-partners-llp",
    client: "Equinox Partners LLP",
    issue: "Covenant breach risk",
    exposureChf: 52_000_000,
    priority: "Medium",
    owner: "A. Patel",
    dueDate: "2025-07-11",
  },
  {
    id: "risk-chen-equity-concentration",
    clientId: "client-chen-private-wealth",
    client: "Chen Private Wealth",
    issue: "Equity concentration",
    exposureChf: 46_000_000,
    priority: "Medium",
    owner: "L. Rossi",
    dueDate: "2025-07-07",
  },
];

const compactClientPortfolioRows = (
  rows: ClientPortfolioReviewToolRow[],
): ClientPortfolioReviewToolRow[] =>
  [...rows]
    .sort((left, right) => right.aumChf - left.aumChf)
    .map((row) => ({
      id: row.id,
      clientId: row.clientId,
      client: row.client,
      segment: row.segment,
      aumChf: row.aumChf,
      netFlow30dChf: row.netFlow30dChf,
      coverageStatus: row.coverageStatus,
      riskProfile: row.riskProfile,
      suitabilityScore: row.suitabilityScore,
      lastReview: row.lastReview,
      relationshipManager: row.relationshipManager,
      nextAction: row.nextAction,
      hasAlert: row.hasAlert,
    }));

const fallbackWorkbenchData = {
  dashboard_snapshot: {
    kpis: {
      totalAum: "CHF 24.8B",
      netNewMoney: "CHF 562M",
      advisoryCoverage: "78%",
      atRiskAccounts: 52,
      clientMeetings: 212,
      complianceAlerts: 7,
    },
  },
  client_portfolio_review: compactClientPortfolioRows(
    clientPortfolioReviewFallback,
  ),
  top_risk_accounts: [
    ...topRiskAccountsFallback.map((risk) => ({
      id: risk.id,
      client: risk.client,
      issue: risk.issue,
      priority: risk.priority,
    })),
  ],
  product_allocation: [
    {
      id: "allocation-equities",
      assetClass: "Equities",
      currentPercent: 48,
      targetPercent: 50,
    },
    {
      id: "allocation-fixed-income",
      assetClass: "Fixed Income",
      currentPercent: 28,
      targetPercent: 25,
    },
  ],
  net_new_money_trend: [
    { id: "nnm-2025-01", label: "Jan '25", netNewMoneyChf: 260_000_000 },
    { id: "nnm-2025-06", label: "Jun '25", netNewMoneyChf: 620_000_000 },
  ],
} satisfies Record<WorkbenchQueryName, unknown>;

const formatCitationLabel = (dataset: WorkbenchQueryName) => {
  switch (dataset) {
    case "dashboard_snapshot":
      return "Dashboard KPIs";
    case "client_portfolio_review":
      return "Client Portfolio Review";
    case "top_risk_accounts":
      return "Top Risk Accounts";
    case "product_allocation":
      return "Product Allocation";
    case "net_new_money_trend":
      return "Net New Money Trend";
  }
};

const createWorkbenchSources = (
  query: WorkbenchQueryName,
  data: unknown,
): WorkbenchCitationSource[] => {
  if (query === "dashboard_snapshot") {
    const snapshot = data as { kpis?: unknown };
    if (Array.isArray(snapshot.kpis)) {
      return snapshot.kpis
        .map((kpi): WorkbenchCitationSource | undefined => {
          if (!kpi || typeof kpi !== "object") return undefined;
          const record = kpi as Record<string, unknown>;
          if (typeof record.id !== "string") return undefined;
          const label =
            typeof record.label === "string" ? record.label : record.id;
          const field = record.id.replace(/^kpi-/, "").replace(/-([a-z])/g, (
            _match,
            letter: string,
          ) => letter.toUpperCase());

          return {
            sourceId: `dashboard_snapshot:${field}`,
            label: `${formatCitationLabel(query)} \u00b7 ${label}`,
            dataset: query,
            rowId: record.id,
            field,
          };
        })
        .filter((source): source is WorkbenchCitationSource => Boolean(source));
    }

    const kpis = snapshot.kpis as Record<string, unknown> | undefined;
    return Object.keys(kpis ?? {}).map((field) => ({
      sourceId: `dashboard_snapshot:${field}`,
      label: `${formatCitationLabel(query)} \u00b7 ${field}`,
      dataset: query,
      field,
    }));
  }

  if (!Array.isArray(data)) return [];

  return data
    .map((row, index): WorkbenchCitationSource | undefined => {
      if (!row || typeof row !== "object") return undefined;
      const record = row as Record<string, unknown>;
      const rowId =
        typeof record.id === "string" ? record.id : `row-${index + 1}`;
      const labelValue =
        typeof record.client === "string"
          ? record.client
          : typeof record.assetClass === "string"
            ? record.assetClass
            : typeof record.label === "string"
              ? record.label
              : `Row ${index + 1}`;

      return {
        sourceId: `${query}:${rowId}`,
        label: `${formatCitationLabel(query)} \u00b7 ${labelValue}`,
        dataset: query,
        rowId,
      };
    })
    .filter((source): source is WorkbenchCitationSource => Boolean(source));
};

const surfaceResourceId = "advisoryWorklist";

type WorkbenchWorklistRow = {
  id: string;
  client: string;
  segment: string;
  aumChf: number;
  netFlow30dChf: number;
  coverageStatus: ClientPortfolioReviewRow["coverageStatus"];
  riskProfile: string;
  riskScore: number;
  relationshipManager: string;
  nextAction: string;
  hasAlert: boolean;
  riskIssue: string;
  riskExposureChf: number | null;
  priority: TopRiskAccountRow["priority"] | "None";
  dueDate: string;
  dueStatus: "Overdue" | "Due soon" | "Open" | "No risk";
};

type WorklistFilter = NonNullable<HostGridViewState["filters"]>[number];
type WorklistSortRule = NonNullable<HostGridViewState["sort"]>[number];

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

const createFallbackDashboardSnapshot = (
  workspaceId: string,
): AdvisoryDashboardSnapshot => ({
  workspaceId,
  asOfDate: "2025-06-30",
  dateRange: {
    from: "2025-04-01",
    to: "2025-06-30",
    label: "Apr 1 - Jun 30, 2025",
  },
  kpis: [],
  clientPortfolioReview: clientPortfolioReviewFallback.map((row, index) => ({
    id: row.id,
    clientId: row.clientId ?? row.id,
    client: row.client,
    segment: row.segment ?? "Client",
    aumChf: row.aumChf,
    netFlow30dChf: row.netFlow30dChf ?? 0,
    riskProfile: row.riskProfile,
    suitabilityScore: row.suitabilityScore ?? 80 + (index % 10),
    coverageStatus:
      row.coverageStatus as ClientPortfolioReviewRow["coverageStatus"],
    lastReview: row.lastReview ?? "2025-06-01",
    relationshipManager: row.relationshipManager ?? "Unassigned",
    nextAction: row.nextAction,
    hasAlert: row.hasAlert,
  })),
  topRiskAccounts: topRiskAccountsFallback.map((risk) => ({
    id: risk.id,
    clientId: risk.clientId ?? risk.id,
    client: risk.client,
    issue: risk.issue,
    exposureChf: risk.exposureChf ?? 0,
    priority: risk.priority,
    owner: risk.owner ?? "Unassigned",
    dueDate: risk.dueDate ?? "",
  })),
  productAllocation: [],
  netNewMoneyTrend: [],
});

const createWorklistRows = (
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

const applyWorklistView = (
  rows: WorkbenchWorklistRow[],
  view: HostGridViewState | undefined,
) => {
  const filtered = applyWorklistFilters(rows, view?.filters);
  const sort = view?.sort ?? defaultWorklistSort;
  return sortWorklistRows(filtered, sort);
};

/**
 * Converts backend-owned Portfolio Worklist rows plus remembered host view
 * state into the bounded “current visible table” context the model may use.
 */
const createSurfaceContextResult = (
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
      label: `Portfolio Worklist \u00b7 ${row.client}`,
      dataset: "client_portfolio_review",
      resourceId: surfaceResourceId,
      rowId: row.id,
    })),
  };
};

export const createWorkbenchTools = (
  databaseUrl?: string,
  hostSurfaceState?: HostSurfaceStatePort,
): WorkbenchToolsPort => {
  const advisoryDashboard = databaseUrl
    ? createPostgresAdvisoryDashboardDb(databaseUrl)
    : undefined;

  return {
    async query({ workspaceId, query }) {
      let data: unknown;

      if (advisoryDashboard) {
        switch (query.query) {
          case "dashboard_snapshot":
            data =
              await advisoryDashboard.getAdvisoryDashboardSnapshot(workspaceId);
            break;
          case "client_portfolio_review":
            data = compactClientPortfolioRows(
              await advisoryDashboard.listClientPortfolioReview(workspaceId),
            );
            break;
          case "top_risk_accounts":
            data = await advisoryDashboard.listTopRiskAccounts(workspaceId);
            break;
          case "product_allocation":
            data = await advisoryDashboard.listProductAllocation(workspaceId);
            break;
          case "net_new_money_trend":
            data = await advisoryDashboard.listNetNewMoneyTrend(workspaceId);
            break;
        }
      } else {
        data = fallbackWorkbenchData[query.query];
      }

      return {
        query: query.query,
        workspaceId,
        data,
        sources: createWorkbenchSources(query.query, data),
      };
    },
    async surfaceContext({
      workspaceId,
      userId,
      conversationId,
      resourceId,
      limit,
    }) {
      const resolvedResourceId =
        resourceId === surfaceResourceId ||
        resourceId.toLowerCase().includes("portfolio") ||
        resourceId.toLowerCase().includes("worklist")
          ? surfaceResourceId
          : resourceId;
      const view = await hostSurfaceState?.getGridView({
        workspaceId,
        userId,
        conversationId,
        resourceId: resolvedResourceId,
      });
      const snapshot =
        advisoryDashboard?.getAdvisoryDashboardSnapshot
          ? await advisoryDashboard.getAdvisoryDashboardSnapshot(workspaceId)
          : createFallbackDashboardSnapshot(workspaceId);
      const rows = createWorklistRows(snapshot);
      const visibleRows = applyWorklistView(rows, view);
      return createSurfaceContextResult(
        workspaceId,
        rows,
        visibleRows,
        view,
        limit,
      );
    },
  };
};
