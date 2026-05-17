import { describe, expect, it } from "vitest";

import type { AdvisoryDashboardSnapshot } from "./advisory-dashboard.types.js";
import { defaultWorkbenchControlState } from "./workbench-controls.js";
import { createWorkbenchPageSnapshot } from "./workbench-page-snapshot.js";

const snapshot: AdvisoryDashboardSnapshot = {
  workspaceId: "demo-workspace",
  asOfDate: "2026-05-17",
  dateRange: {
    from: "2026-02-16",
    label: "Feb 16 - May 17, 2026",
    to: "2026-05-17",
  },
  kpis: [
    {
      delta: "+6.4%",
      id: "kpi-total-aum",
      label: "Total AUM",
      sortOrder: 1,
      trend: "positive",
      value: "CHF 3B",
    },
    {
      delta: "+3.1%",
      id: "kpi-net-new-money",
      label: "Net New Money",
      sortOrder: 2,
      trend: "positive",
      value: "CHF 60M",
    },
    {
      delta: "+4pp",
      id: "kpi-advisory-coverage",
      label: "Advisory Coverage",
      sortOrder: 3,
      trend: "positive",
      value: "50%",
    },
    {
      delta: "+1",
      id: "kpi-at-risk-accounts",
      label: "At-Risk Accounts",
      sortOrder: 4,
      trend: "negative",
      value: "2",
    },
  ],
  clientPortfolioReview: [
    {
      aumChf: 2_000_000_000,
      client: "Safe Client AG",
      clientId: "client-safe",
      coverageStatus: "Covered",
      hasAlert: false,
      id: "review-safe",
      lastReview: "2026-05-10",
      netFlow30dChf: 120_000_000,
      nextAction: "Review",
      relationshipManager: "S. Meier",
      riskProfile: "Balanced",
      segment: "UHNW",
      suitabilityScore: 91,
    },
    {
      aumChf: 1_000_000_000,
      client: "Risk Client AG",
      clientId: "client-risk",
      coverageStatus: "At Risk",
      hasAlert: true,
      id: "review-risk",
      lastReview: "2026-05-08",
      netFlow30dChf: -60_000_000,
      nextAction: "Liquidity plan",
      relationshipManager: "R. Li",
      riskProfile: "Balanced",
      segment: "Corporate",
      suitabilityScore: 68,
    },
  ],
  netNewMoneyTrend: [
    {
      id: "nnm-1",
      label: "Apr '26",
      month: "2026-04-01",
      netNewMoneyChf: 100_000_000,
    },
  ],
  productAllocation: [],
  riskDriverExposure: [],
  riskExposureTrend: [
    {
      date: "2026-05-17",
      eventLabel: null,
      highRiskAumChf: 1_000_000_000,
      id: "risk-trend-1",
      label: "May 17",
      lowRiskAumChf: 0,
      mediumRiskAumChf: 0,
      netNewMoneyChf: 60_000_000,
      noRiskAumChf: 2_000_000_000,
    },
  ],
  segmentRiskScores: [
    {
      id: "segment-risk-corporate-liquidity",
      riskAxis: "Liquidity",
      score: 80,
      segment: "Corporate",
    },
    {
      id: "segment-risk-uhnw-liquidity",
      riskAxis: "Liquidity",
      score: 30,
      segment: "UHNW",
    },
  ],
  topRiskAccounts: [
    {
      client: "Risk Client AG",
      clientId: "client-risk",
      dueDate: "2026-05-14",
      exposureChf: 100_000_000,
      id: "risk-liquidity",
      issue: "Liquidity gap",
      owner: "R. Li",
      priority: "High",
    },
  ],
};

describe("workbench page snapshot", () => {
  it("keeps the original snapshot for the default command bar state", () => {
    expect(createWorkbenchPageSnapshot(snapshot, defaultWorkbenchControlState)).toBe(
      snapshot,
    );
  });

  it("projects charts and KPIs from the current command-bar selection", () => {
    const selected = createWorkbenchPageSnapshot(snapshot, {
      ...defaultWorkbenchControlState,
      dueStatus: "Overdue",
      quickFilters: ["highPriority"],
    });

    expect(selected.clientPortfolioReview).toHaveLength(1);
    expect(selected.clientPortfolioReview[0]?.client).toBe("Risk Client AG");
    expect(selected.topRiskAccounts).toHaveLength(1);
    expect(selected.riskDriverExposure).toEqual([
      {
        driver: "Liquidity gap",
        exposureChf: 100_000_000,
        id: "selected-risk-driver-1",
      },
    ]);
    expect(selected.kpis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Total AUM", value: "CHF 1B" }),
        expect.objectContaining({ label: "At-Risk Accounts", value: "1" }),
      ]),
    );
    expect(selected.riskExposureTrend[0]).toMatchObject({
      highRiskAumChf: 1_000_000_000,
      noRiskAumChf: 0,
    });
  });

  it("filters the selected page state by due-date window", () => {
    const selected = createWorkbenchPageSnapshot(snapshot, {
      ...defaultWorkbenchControlState,
      dueWindow: "thisWeek",
    });

    expect(selected.clientPortfolioReview.map((row) => row.client)).toEqual([
      "Risk Client AG",
    ]);
    expect(selected.topRiskAccounts.map((row) => row.dueDate)).toEqual([
      "2026-05-14",
    ]);
  });
});
