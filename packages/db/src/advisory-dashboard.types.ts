/**
 * Shared dashboard DTOs returned by packages/db and consumed by the dashboard
 * data API plus embedded host app. These are read models, not database tables.
 */
export type AdvisoryKpiTrend = "positive" | "negative" | "neutral";

export type AdvisoryKpi = {
  id: string;
  label: string;
  value: string;
  delta: string;
  trend: AdvisoryKpiTrend;
  sortOrder: number;
};

export type ClientPortfolioReviewRow = {
  id: string;
  clientId: string;
  client: string;
  segment: string;
  aumChf: number;
  netFlow30dChf: number;
  riskProfile: string;
  suitabilityScore: number;
  coverageStatus: "Covered" | "Watch" | "At Risk";
  lastReview: string;
  relationshipManager: string;
  nextAction: string;
  hasAlert: boolean;
};

export type TopRiskAccountRow = {
  id: string;
  clientId: string;
  client: string;
  issue: string;
  exposureChf: number;
  priority: "High" | "Medium" | "Low";
  owner: string;
  dueDate: string;
};

export type ProductAllocationRow = {
  id: string;
  assetClass: string;
  currentPercent: number;
  targetPercent: number;
  driftPp: number;
  recommendedAction: string;
};

export type NetNewMoneyTrendPoint = {
  id: string;
  month: string;
  label: string;
  netNewMoneyChf: number;
};

export type RiskExposureTrendPoint = {
  id: string;
  date: string;
  label: string;
  noRiskAumChf: number;
  lowRiskAumChf: number;
  mediumRiskAumChf: number;
  highRiskAumChf: number;
  netNewMoneyChf: number;
  eventLabel: string | null;
};

export type SegmentRiskScoreRow = {
  id: string;
  segment: string;
  riskAxis: string;
  score: number;
};

export type RiskDriverExposureRow = {
  id: string;
  driver: string;
  exposureChf: number;
};

export type AdvisoryDashboardSnapshot = {
  workspaceId: string;
  asOfDate: string;
  dateRange: {
    from: string;
    to: string;
    label: string;
  };
  kpis: AdvisoryKpi[];
  clientPortfolioReview: ClientPortfolioReviewRow[];
  topRiskAccounts: TopRiskAccountRow[];
  productAllocation: ProductAllocationRow[];
  netNewMoneyTrend: NetNewMoneyTrendPoint[];
  riskExposureTrend: RiskExposureTrendPoint[];
  segmentRiskScores: SegmentRiskScoreRow[];
  riskDriverExposure: RiskDriverExposureRow[];
};
