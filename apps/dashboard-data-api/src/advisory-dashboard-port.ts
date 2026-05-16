import type {
  AdvisoryDashboardSnapshot,
  ClientPortfolioReviewRow,
  NetNewMoneyTrendPoint,
  ProductAllocationRow,
  TopRiskAccountRow,
} from "@side-chat/db";

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
};
