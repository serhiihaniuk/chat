import { Hono } from "hono";
import { Effect } from "effect";
import path from "node:path";
import {
  createPostgresAdvisoryDashboardDb,
  createPostgresSideChatPersistence,
  type AdvisoryDashboardSnapshot,
  type ClientPortfolioReviewRow,
  type TopRiskAccountRow,
} from "@side-chat/db";

import {
  encodeSseFrame,
  protocolArtifacts,
  SidechatProtocol,
  SidechatProtocolHeader,
  SidechatRequestIdHeader,
  SidechatRequestSchema,
  type ModelSelection,
  type SidechatStreamErrorEvent,
  type TokenUsage,
} from "@side-chat/shared-protocol";
import { fakeModelAdapter } from "../../adapters/ai/fake-model.js";
import { openAiModelAdapter } from "../../adapters/ai/openai-model.js";
import {
  createPlaywrightWorkbenchReportPort,
  readGeneratedReport,
} from "../../adapters/reports/playwright-report.js";
import { runEffectBoundary } from "../../application/effect-boundary.js";
import { SideChatDomainError } from "../../application/errors.js";
import {
  streamChatEffect,
  type StreamChatDeps,
} from "../../application/stream-chat.js";
import type {
  ConversationRepository,
  HostGridViewState,
  HostSurfaceStatePort,
  ModelPort,
  PageContextPort,
  UsagePort,
  WorkbenchCitationSource,
  WorkbenchSurfaceContextResult,
  WorkbenchQueryName,
  WorkbenchToolsPort,
} from "../../ports/index.js";
import { parseSideChatEnv } from "./config.js";

const protocol = protocolArtifacts;

const models: ModelSelection[] = [
  { provider: "openai", id: "gpt-5.4-nano", reasoningEffort: "high" },
];

const reportStore = {
  directory: path.resolve(process.cwd(), ".sidechat-reports"),
  publicBasePath:
    process.env.SIDE_CHAT_PUBLIC_REPORT_BASE_PATH ??
    `http://127.0.0.1:${process.env.PORT ?? "3000"}/reports`,
};

const createDefaultPageContext = (): PageContextPort => ({
  async resolve({ workspaceId }) {
    if (workspaceId !== "demo-workspace") return undefined;

    return {
      pageId: "advisory-workbench",
      title: "UBS Partner Advisory Workbench",
      summary:
        "A single-page UBS Partner dashboard for relationship, portfolio performance, advisory coverage, risk, and compliance review.",
      facts: [
        "Top KPIs include Total AUM CHF 24.8B, Net New Money CHF 562M, Advisory Coverage 78%, At-Risk Accounts 52, Client Meetings 212, and Compliance Alerts 7.",
        "The primary table is Portfolio Worklist, a unified AG Grid surface combining client segment, AUM, 30D net flow, risk score, coverage status, priority, risk/task, exposure, due date, due status, relationship manager, next action, and alert state.",
        "The assistant can request filters and sorts on the Portfolio Worklist, including due-date, due-status, risk, flow, coverage, priority, relationship-manager, and alert views.",
        "The visual direction is UBS-inspired: restrained white, charcoal, light gray dividers, and red accent.",
      ],
    };
  },
});

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
            label: `${formatCitationLabel(query)} · ${label}`,
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
      label: `${formatCitationLabel(query)} · ${field}`,
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
        label: `${formatCitationLabel(query)} · ${labelValue}`,
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

const createMemoryHostSurfaceState = (): HostSurfaceStatePort => {
  const views = new Map<string, Map<string, HostGridViewState>>();

  const makeKey = (
    workspaceId: string,
    userId: string,
    conversationId: string | undefined,
  ) => `${workspaceId}:${userId}:${conversationId ?? "latest"}`;

  const setView = (
    workspaceId: string,
    userId: string,
    conversationId: string | undefined,
    resourceId: string,
    view: HostGridViewState | undefined,
  ) => {
    const key = makeKey(workspaceId, userId, conversationId);
    const resourceViews = views.get(key) ?? new Map<string, HostGridViewState>();
    if (view) {
      resourceViews.set(resourceId, view);
    } else {
      resourceViews.delete(resourceId);
    }
    views.set(key, resourceViews);
  };

  return {
    async applyCommand({ workspaceId, userId, conversationId, command }) {
      if (command.type === "grid.applyView") {
        const view = {
          filters: command.view.filters,
          sort: command.view.sort,
          highlightRowIds: command.view.highlightRowIds,
        };
        setView(workspaceId, userId, conversationId, command.resourceId, view);
        setView(workspaceId, userId, undefined, command.resourceId, view);
      }

      if (command.type === "grid.clearView") {
        setView(workspaceId, userId, conversationId, command.resourceId, undefined);
        setView(workspaceId, userId, undefined, command.resourceId, undefined);
      }
    },
    async getGridView({ workspaceId, userId, conversationId, resourceId }) {
      const exact = views
        .get(makeKey(workspaceId, userId, conversationId))
        ?.get(resourceId);
      if (exact) return exact;
      return views.get(makeKey(workspaceId, userId, undefined))?.get(resourceId);
    },
  };
};

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
    coverageStatus: row.coverageStatus as ClientPortfolioReviewRow["coverageStatus"],
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
): unknown => (columnId in row ? row[columnId as keyof WorkbenchWorklistRow] : undefined);

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
  if (columnId.toLowerCase().includes("date")) return compareDateValues(left, right);
  if (typeof left === "number" || typeof right === "number") {
    return Number(left ?? Number.NEGATIVE_INFINITY) -
      Number(right ?? Number.NEGATIVE_INFINITY);
  }
  return normalizeComparableText(left).localeCompare(normalizeComparableText(right));
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
  return normalizeComparableText(left).localeCompare(normalizeComparableText(right));
};

const matchesWorklistFilter = (
  row: WorkbenchWorklistRow,
  filter: NonNullable<HostGridViewState["filters"]>[number],
) => {
  const value = getWorklistValue(row, filter.columnId);
  if (filter.operator === "blank") return isBlank(value);
  if (filter.operator === "notBlank") return !isBlank(value);
  if (filter.operator === "in") {
    const allowed = Array.isArray(filter.value) ? filter.value : [filter.value];
    return allowed.some((item) => valuesEqual(value, item));
  }
  if (filter.operator === "between" && Array.isArray(filter.value)) {
    const [from, to] = filter.value;
    return (
      compareFilterComparable(value, from, filter.columnId) >= 0 &&
      compareFilterComparable(value, to, filter.columnId) <= 0
    );
  }
  if (filter.operator === "equals") return valuesEqual(value, filter.value);
  if (filter.operator === "notEquals") return !valuesEqual(value, filter.value);
  if (filter.operator === "contains") {
    return normalizeComparableText(value).includes(
      normalizeComparableText(filter.value),
    );
  }
  if (filter.operator === "startsWith") {
    return normalizeComparableText(value).startsWith(
      normalizeComparableText(filter.value),
    );
  }
  if (filter.operator === "endsWith") {
    return normalizeComparableText(value).endsWith(
      normalizeComparableText(filter.value),
    );
  }

  const comparison = compareFilterComparable(value, filter.value, filter.columnId);
  if (!Number.isFinite(comparison)) return false;
  if (filter.operator === "greaterThan") return comparison > 0;
  if (filter.operator === "greaterThanOrEqual") return comparison >= 0;
  if (filter.operator === "lessThan") return comparison < 0;
  if (filter.operator === "lessThanOrEqual") return comparison <= 0;
  return false;
};

const applyWorklistView = (
  rows: WorkbenchWorklistRow[],
  view: HostGridViewState | undefined,
) => {
  const filtered =
    view?.filters && view.filters.length > 0
      ? rows.filter((row) =>
          view.filters?.every((filter) => matchesWorklistFilter(row, filter)),
        )
      : [...rows];
  const sort = view?.sort ?? defaultWorklistSort;

  return sort.length > 0
    ? filtered.sort((left, right) => {
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
      })
    : filtered;
};

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
      label: `Portfolio Worklist Â· ${row.client}`,
      dataset: "client_portfolio_review",
      resourceId: surfaceResourceId,
      rowId: row.id,
    })),
  };
};

const createWorkbenchTools = (
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
    async surfaceContext({ workspaceId, userId, conversationId, resourceId, limit }) {
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

const createMemoryConversationRepository = (): ConversationRepository => {
  const messages = new Map<
    string,
    {
      role: "user" | "assistant";
      messageId: string;
      content: string;
      model?: ModelSelection;
      metadata?: Record<string, unknown>;
    }[]
  >();

  return {
    async createOrGet({ conversationId }) {
      const id = conversationId ?? crypto.randomUUID();
      if (!messages.has(id)) messages.set(id, []);
      return id;
    },
    async appendUserMessage(conversationId, messageId, content) {
      messages.get(conversationId)?.push({ role: "user", messageId, content });
    },
    async appendAssistantMessage(
      conversationId,
      messageId,
      content,
      model,
      metadata,
    ) {
      messages
        .get(conversationId)
        ?.push({ role: "assistant", messageId, content, model, metadata });
    },
    async readSeededHistory(workspaceId, conversationId) {
      if (!conversationId) return [];
      if (!messages.has(conversationId)) return [];

      return messages.get(conversationId)!.map((entry) => ({
        id: entry.messageId,
        role: entry.role,
        content: entry.content,
        metadata: entry.metadata,
      }));
    },
  };
};

const createMemoryUsageRepository = (): UsagePort => {
  const records: Array<{
    workspaceId: string;
    userId: string;
    conversationId: string;
    usage: TokenUsage;
    createdAt: number;
  }> = [];

  return {
    async record({ conversationId, usage }) {
      records.push({
        workspaceId: "demo-workspace",
        userId: "local-user",
        conversationId,
        usage,
        createdAt: Date.now(),
      });
    },
    async latest({ workspaceId, userId, conversationId }) {
      return records
        .filter(
          (record) =>
            record.workspaceId === workspaceId &&
            record.userId === userId &&
            record.conversationId === conversationId,
        )
        .sort((left, right) => right.createdAt - left.createdAt)[0]?.usage;
    },
  };
};

const unconfiguredModelAdapter: ModelPort = {
  async *stream() {
    throw new Error(
      "AI model is not configured. Set OPENAI_API_KEY with SIDE_CHAT_MODEL_ADAPTER=openai, or set USE_FAKE_MODEL=true for tests.",
    );
  },
};

export const createDefaultDeps = (): StreamChatDeps => {
  const env = parseSideChatEnv();
  const persistence = env.DATABASE_URL
    ? createPostgresSideChatPersistence(env.DATABASE_URL)
    : undefined;
  const hostSurfaceState = createMemoryHostSurfaceState();
  const allowlist = env.SIDE_CHAT_ALLOWED_WORKSPACE_IDS
    ? env.SIDE_CHAT_ALLOWED_WORKSPACE_IDS.split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;
  const blocklist = env.SIDE_CHAT_BLOCKED_WORKSPACE_IDS
    ? env.SIDE_CHAT_BLOCKED_WORKSPACE_IDS.split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;

  return {
    model: env.USE_FAKE_MODEL
      ? fakeModelAdapter
      : env.SIDE_CHAT_MODEL_ADAPTER === "openai" && env.OPENAI_API_KEY
        ? openAiModelAdapter
        : unconfiguredModelAdapter,
    pageContext: createDefaultPageContext(),
    workbenchTools: createWorkbenchTools(env.DATABASE_URL, hostSurfaceState),
    workbenchReports: createPlaywrightWorkbenchReportPort(reportStore),
    hostSurfaceState,
    conversations:
      persistence?.conversations ?? createMemoryConversationRepository(),
    usage: persistence?.usage ?? createMemoryUsageRepository(),
    auth: {
      async authorize(workspaceId) {
        if (allowlist && allowlist.length > 0)
          return allowlist.includes(workspaceId);
        if (blocklist && blocklist.includes(workspaceId)) return false;
        return true;
      },
    },
    rateLimit: {
      async check(_workspaceId, _userId) {
        return env.SIDE_CHAT_RATE_LIMITING_ENABLED;
      },
    },
    billing: {
      async allow(_workspaceId) {
        return env.SIDE_CHAT_BILLING_ENABLED;
      },
    },
    observability: {
      lifecycle() {},
      counter() {},
      async span(_name, run) {
        return run();
      },
    },
    config: {
      models() {
        return models;
      },
      defaultUserId() {
        return env.SIDE_CHAT_DEFAULT_USER_ID;
      },
    },
  };
};

const toProtocolError = (
  requestId: string,
  error: unknown,
): SidechatStreamErrorEvent => {
  if (error instanceof SideChatDomainError) {
    return {
      type: protocol.error,
      requestId,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }

  return {
    type: protocol.error,
    requestId,
    code: "InternalError",
    message:
      error instanceof Error ? error.message : "Unexpected stream failure",
    retryable: false,
  };
};

const preStreamErrorResponse = (
  requestId: string,
  status: 400,
  code: string,
  message: string,
) =>
  new Response(
    JSON.stringify({
      error: {
        code,
        message,
        requestId,
        retryable: false,
      },
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        [SidechatProtocolHeader]: protocol.protocol,
        [SidechatRequestIdHeader]: requestId,
      },
    },
  );

const streamEvents = (
  deps: StreamChatDeps,
  body: unknown,
  requestId: string,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        await runEffectBoundary(() =>
          deps.observability.span("sidechat.stream", async () => {
            const events = await Effect.runPromise(
              streamChatEffect(deps, { requestId, body, signal }),
            );
            for await (const event of events) {
              controller.enqueue(encoder.encode(`${encodeSseFrame(event)}\n`));
            }
          }),
        );
      } catch (error) {
        const protocolError = toProtocolError(requestId, error);
        deps.observability.lifecycle(protocolError);
        deps.observability.counter("sidechat.stream.error", {
          code: protocolError.code,
        });
        controller.enqueue(
          encoder.encode(`${encodeSseFrame(protocolError)}\n`),
        );
      } finally {
        controller.close();
      }
    },
  });
};

export const createInboundApp = (
  deps: StreamChatDeps = createDefaultDeps(),
) => {
  const app = new Hono();

  app.get(SidechatProtocol.healthRoute, (c) => c.json({ ok: true }));
  app.get(SidechatProtocol.modelsRoute, (c) =>
    c.json({ models: deps.config.models() }),
  );

  app.get("/reports/:fileName", async (c) => {
    const fileName = c.req.param("fileName");
    const file = await readGeneratedReport(reportStore, fileName);
    if (!file) return c.text("Report not found", 404);

    return new Response(file, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  });

  app.get("/chat/history", async (c) => {
    const workspaceId = c.req.query("workspaceId") ?? "";
    const conversationId = c.req.query("conversationId") ?? "";

    if (!workspaceId || !conversationId) {
      return c.json(
        { error: "workspaceId and conversationId are required" },
        400,
      );
    }

    const isAuthorized = await deps.auth.authorize(
      workspaceId,
      deps.config.defaultUserId(),
    );
    if (!isAuthorized) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const rows = await deps.conversations.readSeededHistory(
      workspaceId,
      conversationId,
    );
    return c.json({ conversationId, messages: rows });
  });

  app.get("/chat/usage", async (c) => {
    const workspaceId = c.req.query("workspaceId") ?? "";
    const conversationId = c.req.query("conversationId") ?? "";

    if (!workspaceId || !conversationId) {
      return c.json(
        { error: "workspaceId and conversationId are required" },
        400,
      );
    }

    const userId = deps.config.defaultUserId();
    const isAuthorized = await deps.auth.authorize(workspaceId, userId);
    if (!isAuthorized) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const usage = await deps.usage.latest({
      workspaceId,
      userId,
      conversationId,
    });
    return c.json({ conversationId, usage: usage ?? null });
  });

  app.post(SidechatProtocol.streamRoute, async (c) => {
    const requestId =
      c.req.header(SidechatRequestIdHeader) ?? crypto.randomUUID();
    const protocolHeader = c.req.header(SidechatProtocolHeader);

    if (protocolHeader !== protocol.protocol) {
      return preStreamErrorResponse(
        requestId,
        400,
        "InvalidProtocol",
        "X-Sidechat-Protocol: sidechat.v1 is required",
      );
    }

    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      body = undefined;
    }

    const parsed = SidechatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return preStreamErrorResponse(
        requestId,
        400,
        "InvalidRequest",
        "workspaceId, message.content and model.id are required",
      );
    }

    return c.body(
      streamEvents(deps, parsed.data, requestId, c.req.raw.signal),
      200,
      {
        "Content-Type": SidechatProtocol.streamContentType,
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        [SidechatProtocolHeader]: protocol.protocol,
        [SidechatRequestIdHeader]: requestId,
      },
    );
  });

  return app;
};

export const inboundApp = createInboundApp();
