import { describe, expect, it } from "vitest";
import { AdvisoryDashboardDb } from "../src/index.js";

describe("advisory dashboard db adapter", () => {
  it("reads the snapshot through the stored function boundary", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const db = new AdvisoryDashboardDb({
      async query(text, params) {
        calls.push({ text, params });
        return {
          rows: [
            {
              snapshot: {
                workspaceId: "demo-workspace",
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
                    delta: "6.4% vs prior quarter",
                    trend: "positive",
                    sortOrder: 1,
                  },
                ],
                clientPortfolioReview: [],
                topRiskAccounts: [],
                productAllocation: [],
                netNewMoneyTrend: [],
                riskExposureTrend: [],
                segmentRiskScores: [],
                riskDriverExposure: [],
              },
            },
          ],
        };
      },
    });

    await expect(
      db.getAdvisoryDashboardSnapshot("demo-workspace"),
    ).resolves.toMatchObject({
      workspaceId: "demo-workspace",
      kpis: [{ id: "kpi-total-aum" }],
    });
    expect(calls).toEqual([
      {
        text: "select * from ubs_get_advisory_dashboard_snapshot($1)",
        params: ["demo-workspace"],
      },
    ]);
  });

  it("uses only stored functions for dashboard rowsets", async () => {
    const calls: string[] = [];
    const db = new AdvisoryDashboardDb({
      async query(text) {
        calls.push(text);
        return { rows: [] };
      },
    });

    await db.listClientPortfolioReview("demo-workspace");
    await db.listTopRiskAccounts("demo-workspace");
    await db.listProductAllocation("demo-workspace");
    await db.listNetNewMoneyTrend("demo-workspace");
    await db.listRiskExposureTrend("demo-workspace");
    await db.listSegmentRiskScores("demo-workspace");
    await db.listRiskDriverExposure("demo-workspace");

    expect(calls).toEqual([
      "select * from ubs_list_client_portfolio_review($1)",
      "select * from ubs_list_top_risk_accounts($1)",
      "select * from ubs_list_product_allocation($1)",
      "select * from ubs_list_net_new_money_trend($1)",
      "select * from ubs_list_risk_exposure_trend($1)",
      "select * from ubs_list_segment_risk_scores($1)",
      "select * from ubs_list_risk_driver_exposure($1)",
    ]);
    expect(calls.every((query) => /^select \* from ubs_/.test(query))).toBe(
      true,
    );
  });
});
