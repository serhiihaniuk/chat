import type {
  AdvisoryDashboardSnapshot,
  ClientPortfolioReviewRow,
} from "@side-chat/db";
import type { WorkbenchQueryName } from "#ports/index.js";
import type {
  ClientPortfolioReviewToolRow,
  TopRiskAccountToolRow,
} from "./types.js";

export const clientPortfolioReviewFallback: ClientPortfolioReviewToolRow[] = [
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

export const topRiskAccountsFallback: TopRiskAccountToolRow[] = [
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

export const compactClientPortfolioRows = (
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

export const fallbackWorkbenchData = {
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

export const createFallbackDashboardSnapshot = (
  workspaceId: string,
): AdvisoryDashboardSnapshot =>
  rollFallbackDashboardDates({
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
  riskExposureTrend: [
    {
      id: "risk-trend-fallback-apr",
      date: "2025-04-01",
      label: "Apr '25",
      noRiskAumChf: 12_300_000_000,
      lowRiskAumChf: 3_600_000_000,
      mediumRiskAumChf: 5_200_000_000,
      highRiskAumChf: 3_600_000_000,
      netNewMoneyChf: -520_000_000,
      eventLabel: null,
    },
    {
      id: "risk-trend-fallback-may",
      date: "2025-05-12",
      label: "May 12",
      noRiskAumChf: 13_400_000_000,
      lowRiskAumChf: 3_900_000_000,
      mediumRiskAumChf: 5_400_000_000,
      highRiskAumChf: 3_700_000_000,
      netNewMoneyChf: -220_000_000,
      eventLabel: "Policy update",
    },
    {
      id: "risk-trend-fallback-jun",
      date: "2025-06-30",
      label: "Jun 30",
      noRiskAumChf: 14_800_000_000,
      lowRiskAumChf: 4_200_000_000,
      mediumRiskAumChf: 5_800_000_000,
      highRiskAumChf: 4_000_000_000,
      netNewMoneyChf: 790_000_000,
      eventLabel: null,
    },
  ],
  segmentRiskScores: [
    {
      id: "segment-risk-fallback-corporate-liquidity",
      segment: "Corporate",
      riskAxis: "Liquidity",
      score: 82,
    },
    {
      id: "segment-risk-fallback-uhnw-liquidity",
      segment: "UHNW",
      riskAxis: "Liquidity",
      score: 52,
    },
    {
      id: "segment-risk-fallback-institutional-liquidity",
      segment: "Institutional",
      riskAxis: "Liquidity",
      score: 34,
    },
  ],
  riskDriverExposure: [
    {
      id: "risk-driver-fallback-liquidity-gap",
      driver: "Liquidity gap",
      exposureChf: 1_400_000_000,
    },
    {
      id: "risk-driver-fallback-margin-pressure",
      driver: "Margin pressure",
      exposureChf: 1_100_000_000,
    },
    {
      id: "risk-driver-fallback-other",
      driver: "Other",
      exposureChf: 3_200_000_000,
    },
  ],
});

const rollFallbackDashboardDates = (
  snapshot: AdvisoryDashboardSnapshot,
): AdvisoryDashboardSnapshot => {
  const dates = createFallbackDateContext();
  const trendStartMonth = addMonths(
    startOfUtcMonth(dates.asOfDateValue),
    1 - snapshot.netNewMoneyTrend.length,
  );

  return {
    ...snapshot,
    asOfDate: dates.asOfDate,
    clientPortfolioReview: snapshot.clientPortfolioReview.map((row) => ({
      ...row,
      lastReview: dates.shiftFromBaselineAsOf(row.lastReview),
    })),
    dateRange: {
      from: dates.rangeFrom,
      label: dates.rangeLabel,
      to: dates.asOfDate,
    },
    netNewMoneyTrend: snapshot.netNewMoneyTrend.map((point, index) => {
      const monthDate = addMonths(trendStartMonth, index);
      return {
        ...point,
        label: formatMonthYearLabel(monthDate),
        month: formatIsoDate(monthDate),
      };
    }),
    riskExposureTrend: snapshot.riskExposureTrend.map((point, index) => {
      const date = dates.shiftFromBaselineRange(point.date);
      return {
        ...point,
        date: formatIsoDate(date),
        label: index === 0 ? formatMonthYearLabel(date) : formatMonthDayLabel(date),
      };
    }),
    topRiskAccounts: snapshot.topRiskAccounts.map((risk) => ({
      ...risk,
      dueDate: dates.shiftFromBaselineAsOf(risk.dueDate),
    })),
  };
};

const fallbackBaselineAsOf = Date.UTC(2025, 5, 30);
const fallbackBaselineRangeFrom = Date.UTC(2025, 3, 1);
const fallbackDayMs = 24 * 60 * 60 * 1000;

const createFallbackDateContext = () => {
  const asOfDateValue = todayUtc();
  const rangeFromValue = addDays(asOfDateValue, -90);

  return {
    asOfDate: formatIsoDate(asOfDateValue),
    asOfDateValue,
    rangeFrom: formatIsoDate(rangeFromValue),
    rangeLabel: `${formatMonthDayLabel(rangeFromValue)} - ${formatMonthDayYearLabel(asOfDateValue)}`,
    shiftFromBaselineAsOf: (value: string) =>
      formatIsoDate(
        addDays(
          parseIsoDate(value),
          diffDays(asOfDateValue, fallbackBaselineAsOf),
        ),
      ),
    shiftFromBaselineRange: (value: string) =>
      addDays(
        parseIsoDate(value),
        diffDays(rangeFromValue, fallbackBaselineRangeFrom),
      ),
  };
};

const todayUtc = () => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

const parseIsoDate = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : todayUtc();
};

const addDays = (value: number, days: number) => value + days * fallbackDayMs;

const addMonths = (value: number, months: number) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
};

const startOfUtcMonth = (value: number) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};

const diffDays = (left: number, right: number) =>
  Math.round((left - right) / fallbackDayMs);

const formatIsoDate = (value: number) => new Date(value).toISOString().slice(0, 10);

const formatMonthDayLabel = (value: number) =>
  new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));

const formatMonthDayYearLabel = (value: number) =>
  new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));

const formatMonthYearLabel = (value: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
    year: "2-digit",
  })
    .format(new Date(value))
    .replace(" ", " '");
