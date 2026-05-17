import type {
  AdvisoryDashboardSnapshot,
  ClientPortfolioReviewRow,
  NetNewMoneyTrendPoint,
  ProductAllocationRow,
  RiskDriverExposureRow,
  RiskExposureTrendPoint,
  SegmentRiskScoreRow,
  TopRiskAccountRow,
} from "@side-chat/db";

/**
 * Read-side port for the dashboard service. Hono routes depend on this shape,
 * so tests and fixture mode can replace Postgres without changing route code.
 */
export type AdvisoryDashboardReader = {
  getAdvisoryDashboardSnapshot(
    workspaceId: string,
  ): Promise<AdvisoryDashboardSnapshot>;
  listClientPortfolioReview(
    workspaceId: string,
  ): Promise<ClientPortfolioReviewRow[]>;
  listTopRiskAccounts(workspaceId: string): Promise<TopRiskAccountRow[]>;
  listProductAllocation(
    workspaceId: string,
  ): Promise<ProductAllocationRow[]>;
  listNetNewMoneyTrend(workspaceId: string): Promise<NetNewMoneyTrendPoint[]>;
  listRiskExposureTrend(
    workspaceId: string,
  ): Promise<RiskExposureTrendPoint[]>;
  listSegmentRiskScores(workspaceId: string): Promise<SegmentRiskScoreRow[]>;
  listRiskDriverExposure(
    workspaceId: string,
  ): Promise<RiskDriverExposureRow[]>;
};
