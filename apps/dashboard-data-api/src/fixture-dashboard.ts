import type { AdvisoryDashboardSnapshot } from "@side-chat/db";

import type { AdvisoryDashboardReader } from "./advisory-dashboard-port.js";

/**
 * Deterministic reader for no-DB local and e2e paths. It satisfies the same
 * dashboard port as Postgres, so route behavior stays identical.
 */
const createFixtureSnapshot = (
  workspaceId: string,
): AdvisoryDashboardSnapshot =>
  rollSnapshotDates({
  workspaceId,
  asOfDate: "2025-06-30",
  dateRange: {
    from: "2025-04-01",
    to: "2025-06-30",
    label: "Apr 1 - Jun 30, 2025",
  },
  kpis: [
    {
      id: "kpi-total-aum",
      label: "Total AUM",
      value: "CHF 24.8B",
      delta: "+4.2% QoQ",
      trend: "positive",
      sortOrder: 1,
    },
    {
      id: "kpi-net-new-money",
      label: "Net New Money",
      value: "CHF 562M",
      delta: "+CHF 118M",
      trend: "positive",
      sortOrder: 2,
    },
    {
      id: "kpi-advisory-coverage",
      label: "Advisory Coverage",
      value: "78%",
      delta: "+6 pp",
      trend: "positive",
      sortOrder: 3,
    },
    {
      id: "kpi-at-risk-accounts",
      label: "At-Risk Accounts",
      value: "52",
      delta: "+8 this week",
      trend: "negative",
      sortOrder: 4,
    },
    {
      id: "kpi-client-meetings",
      label: "Client Meetings",
      value: "212",
      delta: "+18 planned",
      trend: "positive",
      sortOrder: 5,
    },
    {
      id: "kpi-compliance-alerts",
      label: "Compliance Alerts",
      value: "7",
      delta: "-3 cleared",
      trend: "positive",
      sortOrder: 6,
    },
  ],
  clientPortfolioReview: [
    {
      id: "review-ackermann-family-office",
      clientId: "client-ackermann-family-office",
      client: "Ackermann Family Office",
      segment: "UHNW",
      aumChf: 3_428_000_000,
      netFlow30dChf: 118_000_000,
      riskProfile: "Balanced",
      suitabilityScore: 92,
      coverageStatus: "Covered",
      lastReview: "2025-06-12",
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
      netFlow30dChf: 72_000_000,
      riskProfile: "Moderate",
      suitabilityScore: 86,
      coverageStatus: "Covered",
      lastReview: "2025-06-18",
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
      netFlow30dChf: -24_000_000,
      riskProfile: "Growth",
      suitabilityScore: 78,
      coverageStatus: "Watch",
      lastReview: "2025-05-28",
      relationshipManager: "L. Rossi",
      nextAction: "Rebalance",
      hasAlert: true,
    },
    {
      id: "review-global-medtech-inc",
      clientId: "client-global-medtech-inc",
      client: "Global MedTech Inc.",
      segment: "Corporate",
      aumChf: 654_000_000,
      netFlow30dChf: -41_000_000,
      riskProfile: "Balanced",
      suitabilityScore: 69,
      coverageStatus: "At Risk",
      lastReview: "2025-05-06",
      relationshipManager: "R. Li",
      nextAction: "Liquidity plan",
      hasAlert: true,
    },
  ],
  topRiskAccounts: [
    {
      id: "risk-global-medtech-liquidity-gap",
      clientId: "client-global-medtech-inc",
      client: "Global MedTech Inc.",
      issue: "Liquidity gap",
      exposureChf: 112_000_000,
      priority: "High",
      owner: "R. Li",
      dueDate: "2025-06-30",
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
  ],
  productAllocation: [
    {
      id: "allocation-equities",
      assetClass: "Equities",
      currentPercent: 48,
      targetPercent: 50,
      driftPp: -2,
      recommendedAction: "Rebalance into target range",
    },
    {
      id: "allocation-fixed-income",
      assetClass: "Fixed Income",
      currentPercent: 28,
      targetPercent: 25,
      driftPp: 3,
      recommendedAction: "Review duration exposure",
    },
  ],
  netNewMoneyTrend: [
    {
      id: "nnm-2025-04",
      month: "2025-04",
      label: "Apr '25",
      netNewMoneyChf: 386_000_000,
    },
    {
      id: "nnm-2025-05",
      month: "2025-05",
      label: "May '25",
      netNewMoneyChf: 444_000_000,
    },
    {
      id: "nnm-2025-06",
      month: "2025-06",
      label: "Jun '25",
      netNewMoneyChf: 562_000_000,
    },
  ],
  riskExposureTrend: [
    {
      id: "risk-trend-2025-04-01",
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
      id: "risk-trend-2025-04-15",
      date: "2025-04-15",
      label: "Apr 15",
      noRiskAumChf: 12_700_000_000,
      lowRiskAumChf: 3_500_000_000,
      mediumRiskAumChf: 5_400_000_000,
      highRiskAumChf: 3_500_000_000,
      netNewMoneyChf: 240_000_000,
      eventLabel: "Market volatility",
    },
    {
      id: "risk-trend-2025-05-12",
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
      id: "risk-trend-2025-06-14",
      date: "2025-06-14",
      label: "Jun 14",
      noRiskAumChf: 14_300_000_000,
      lowRiskAumChf: 4_000_000_000,
      mediumRiskAumChf: 5_600_000_000,
      highRiskAumChf: 3_700_000_000,
      netNewMoneyChf: 160_000_000,
      eventLabel: "Fee guidance",
    },
    {
      id: "risk-trend-2025-06-30",
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
    { id: "segment-risk-corporate-liquidity", segment: "Corporate", riskAxis: "Liquidity", score: 82 },
    { id: "segment-risk-uhnw-liquidity", segment: "UHNW", riskAxis: "Liquidity", score: 52 },
    { id: "segment-risk-institutional-liquidity", segment: "Institutional", riskAxis: "Liquidity", score: 34 },
    { id: "segment-risk-corporate-credit", segment: "Corporate", riskAxis: "Credit", score: 72 },
    { id: "segment-risk-uhnw-credit", segment: "UHNW", riskAxis: "Credit", score: 49 },
    { id: "segment-risk-institutional-credit", segment: "Institutional", riskAxis: "Credit", score: 38 },
    { id: "segment-risk-corporate-concentration", segment: "Corporate", riskAxis: "Concentration", score: 79 },
    { id: "segment-risk-uhnw-concentration", segment: "UHNW", riskAxis: "Concentration", score: 60 },
    { id: "segment-risk-institutional-concentration", segment: "Institutional", riskAxis: "Concentration", score: 44 },
    { id: "segment-risk-corporate-margin", segment: "Corporate", riskAxis: "Margin", score: 58 },
    { id: "segment-risk-uhnw-margin", segment: "UHNW", riskAxis: "Margin", score: 64 },
    { id: "segment-risk-institutional-margin", segment: "Institutional", riskAxis: "Margin", score: 46 },
    { id: "segment-risk-corporate-covenant", segment: "Corporate", riskAxis: "Covenant", score: 69 },
    { id: "segment-risk-uhnw-covenant", segment: "UHNW", riskAxis: "Covenant", score: 72 },
    { id: "segment-risk-institutional-covenant", segment: "Institutional", riskAxis: "Covenant", score: 35 },
    { id: "segment-risk-corporate-collateral", segment: "Corporate", riskAxis: "Collateral", score: 65 },
    { id: "segment-risk-uhnw-collateral", segment: "UHNW", riskAxis: "Collateral", score: 46 },
    { id: "segment-risk-institutional-collateral", segment: "Institutional", riskAxis: "Collateral", score: 41 },
  ],
  riskDriverExposure: [
    { id: "risk-driver-liquidity-gap", driver: "Liquidity gap", exposureChf: 1_400_000_000 },
    { id: "risk-driver-margin-pressure", driver: "Margin pressure", exposureChf: 1_100_000_000 },
    { id: "risk-driver-credit-concentration", driver: "Credit concentration", exposureChf: 1_000_000_000 },
    { id: "risk-driver-collateral-shortfall", driver: "Collateral shortfall", exposureChf: 600_000_000 },
    { id: "risk-driver-market-volatility", driver: "Market volatility", exposureChf: 800_000_000 },
    { id: "risk-driver-other", driver: "Other", exposureChf: 800_000_000 },
  ],
  });

const rollSnapshotDates = (
  snapshot: AdvisoryDashboardSnapshot,
): AdvisoryDashboardSnapshot => {
  const dates = createDemoDateContext();
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
    topRiskAccounts: snapshot.topRiskAccounts.map((row) => ({
      ...row,
      dueDate: dates.shiftFromBaselineAsOf(row.dueDate),
    })),
  };
};

const baselineAsOf = Date.UTC(2025, 5, 30);
const baselineRangeFrom = Date.UTC(2025, 3, 1);
const dayMs = 24 * 60 * 60 * 1000;

const createDemoDateContext = () => {
  const asOfDateValue = todayUtc();
  const rangeFromValue = addDays(asOfDateValue, -90);

  return {
    asOfDate: formatIsoDate(asOfDateValue),
    asOfDateValue,
    rangeFrom: formatIsoDate(rangeFromValue),
    rangeLabel: `${formatMonthDayLabel(rangeFromValue)} - ${formatMonthDayYearLabel(asOfDateValue)}`,
    shiftFromBaselineAsOf: (value: string) =>
      formatIsoDate(addDays(parseIsoDate(value), diffDays(asOfDateValue, baselineAsOf))),
    shiftFromBaselineRange: (value: string) =>
      addDays(parseIsoDate(value), diffDays(rangeFromValue, baselineRangeFrom)),
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

const addDays = (value: number, days: number) => value + days * dayMs;

const addMonths = (value: number, months: number) => {
  const date = new Date(value);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    1,
  );
};

const startOfUtcMonth = (value: number) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};

const diffDays = (left: number, right: number) =>
  Math.round((left - right) / dayMs);

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

export const createFixtureAdvisoryDashboardReader =
  (): AdvisoryDashboardReader => ({
    async getAdvisoryDashboardSnapshot(workspaceId) {
      return createFixtureSnapshot(workspaceId);
    },
    async listClientPortfolioReview(workspaceId) {
      return createFixtureSnapshot(workspaceId).clientPortfolioReview;
    },
    async listTopRiskAccounts(workspaceId) {
      return createFixtureSnapshot(workspaceId).topRiskAccounts;
    },
    async listProductAllocation(workspaceId) {
      return createFixtureSnapshot(workspaceId).productAllocation;
    },
    async listNetNewMoneyTrend(workspaceId) {
      return createFixtureSnapshot(workspaceId).netNewMoneyTrend;
    },
    async listRiskExposureTrend(workspaceId) {
      return createFixtureSnapshot(workspaceId).riskExposureTrend;
    },
    async listSegmentRiskScores(workspaceId) {
      return createFixtureSnapshot(workspaceId).segmentRiskScores;
    },
    async listRiskDriverExposure(workspaceId) {
      return createFixtureSnapshot(workspaceId).riskDriverExposure;
    },
  });
