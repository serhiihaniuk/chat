import { Pool } from "pg";
import { z } from "zod";

import type { DbExecutor } from "./index.js";
import type {
  AdvisoryDashboardSnapshot,
  ClientPortfolioReviewRow,
  NetNewMoneyTrendPoint,
  ProductAllocationRow,
  TopRiskAccountRow,
} from "./advisory-dashboard.types.js";

const advisoryKpiSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  delta: z.string(),
  trend: z.enum(["positive", "negative", "neutral"]),
  sortOrder: z.number(),
});

const clientPortfolioReviewRowSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  client: z.string(),
  segment: z.string(),
  aumChf: z.number(),
  netFlow30dChf: z.number(),
  riskProfile: z.string(),
  suitabilityScore: z.number(),
  coverageStatus: z.enum(["Covered", "Watch", "At Risk"]),
  lastReview: z.string(),
  relationshipManager: z.string(),
  nextAction: z.string(),
  hasAlert: z.boolean(),
});

const topRiskAccountRowSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  client: z.string(),
  issue: z.string(),
  exposureChf: z.number(),
  priority: z.enum(["High", "Medium", "Low"]),
  owner: z.string(),
  dueDate: z.string(),
});

const productAllocationRowSchema = z.object({
  id: z.string(),
  assetClass: z.string(),
  currentPercent: z.number(),
  targetPercent: z.number(),
  driftPp: z.number(),
  recommendedAction: z.string(),
});

const netNewMoneyTrendPointSchema = z.object({
  id: z.string(),
  month: z.string(),
  label: z.string(),
  netNewMoneyChf: z.number(),
});

const advisoryDashboardSnapshotSchema = z.object({
  workspaceId: z.string(),
  asOfDate: z.string(),
  dateRange: z.object({
    from: z.string(),
    to: z.string(),
    label: z.string(),
  }),
  kpis: z.array(advisoryKpiSchema),
  clientPortfolioReview: z.array(clientPortfolioReviewRowSchema),
  topRiskAccounts: z.array(topRiskAccountRowSchema),
  productAllocation: z.array(productAllocationRowSchema),
  netNewMoneyTrend: z.array(netNewMoneyTrendPointSchema),
});

type SnapshotRow = { snapshot: unknown };

export class AdvisoryDashboardDb {
  constructor(private readonly db: DbExecutor) {}

  async getAdvisoryDashboardSnapshot(
    workspaceId: string,
  ): Promise<AdvisoryDashboardSnapshot> {
    const result = await this.db.query<SnapshotRow>(
      "select * from ubs_get_advisory_dashboard_snapshot($1)",
      [workspaceId],
    );
    const snapshot = result.rows[0]?.snapshot;
    if (!snapshot) {
      throw new Error("ubs_get_advisory_dashboard_snapshot returned no data");
    }
    return advisoryDashboardSnapshotSchema.parse(snapshot);
  }

  async listClientPortfolioReview(
    workspaceId: string,
  ): Promise<ClientPortfolioReviewRow[]> {
    const result = await this.db.query<SnapshotRow>(
      "select * from ubs_list_client_portfolio_review($1)",
      [workspaceId],
    );
    return z.array(clientPortfolioReviewRowSchema).parse(result.rows);
  }

  async listTopRiskAccounts(
    workspaceId: string,
  ): Promise<TopRiskAccountRow[]> {
    const result = await this.db.query<SnapshotRow>(
      "select * from ubs_list_top_risk_accounts($1)",
      [workspaceId],
    );
    return z.array(topRiskAccountRowSchema).parse(result.rows);
  }

  async listProductAllocation(
    workspaceId: string,
  ): Promise<ProductAllocationRow[]> {
    const result = await this.db.query<SnapshotRow>(
      "select * from ubs_list_product_allocation($1)",
      [workspaceId],
    );
    return z.array(productAllocationRowSchema).parse(result.rows);
  }

  async listNetNewMoneyTrend(
    workspaceId: string,
  ): Promise<NetNewMoneyTrendPoint[]> {
    const result = await this.db.query<SnapshotRow>(
      "select * from ubs_list_net_new_money_trend($1)",
      [workspaceId],
    );
    return z.array(netNewMoneyTrendPointSchema).parse(result.rows);
  }
}

export const createPostgresAdvisoryDashboardDb = (
  connectionString: string,
): AdvisoryDashboardDb => {
  return new AdvisoryDashboardDb(new Pool({ connectionString }));
};
