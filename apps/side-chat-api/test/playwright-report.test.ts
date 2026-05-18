import { describe, expect, it } from "vitest";
import {
  createAnalystNoteParagraphs,
  createReportHtml,
} from "#adapters/reports/playwright-report.js";

const reportData = {
  kpis: {
    netNewMoney: "CHF 562M",
    atRiskAccounts: "52",
  },
  clients: [
    {
      client: "Ackermann Family Office",
      riskProfile: "Balanced",
      coverageStatus: "Covered",
    },
    {
      client: "Chen Private Wealth",
      riskProfile: "Growth",
      coverageStatus: "Watch",
    },
  ],
  risks: [
    {
      client: "Global MedTech Inc.",
      issue: "Liquidity gap",
      priority: "High",
      exposureChf: 112_000_000,
    },
  ],
  trend: [{ label: "Jun '25", netNewMoneyChf: 620_000_000 }],
};

describe("workbench report analyst note", () => {
  it("keeps user-requested suitability wording inside the analyst note", () => {
    const paragraphs = createAnalystNoteParagraphs({
      ...reportData,
      noteKind: "custom",
      note: "Suitability score is weak. Position this for RM handoff and client follow-up.",
    });

    expect(paragraphs).toEqual([
      "Suitability score is weak. Position this for RM handoff and client follow-up.",
    ]);
  });

  it("renders a risk rationale from the highest-priority risk row", () => {
    const paragraphs = createAnalystNoteParagraphs({
      ...reportData,
      noteKind: "risk_rationale",
    });

    expect(paragraphs).toEqual([
      "Risk rationale: outreach priority should start with Global MedTech Inc. because the workbench flags liquidity gap with High priority and CHF 112M exposure.",
    ]);
  });

  it("allows custom report-ready wording without adding boilerplate", () => {
    const paragraphs = createAnalystNoteParagraphs({
      ...reportData,
      noteKind: "custom",
      note: "Include a client-ready paragraph about improving momentum.",
    });

    expect(paragraphs).toEqual([
      "Include a client-ready paragraph about improving momentum.",
    ]);
  });

  it("renders a data-backed top-risk portfolio report from dashboard rows", () => {
    const html = createReportHtml({
      title: "Top Risk Portfolios - Risk Report",
      focus: "risk_review",
      sections: ["kpis", "risk_accounts", "net_new_money_trend"],
      noteKind: "risk_rationale",
      generatedAt: "2026-05-18",
      snapshot: {
        kpis: [
          { label: "Total AUM", value: "CHF 24.8B" },
          { label: "Net New Money", value: "CHF 562M" },
          { label: "Advisory Coverage", value: "78%" },
          { label: "At-Risk Accounts", value: "52" },
          { label: "Compliance Alerts", value: "7" },
        ],
      },
      clients: [
        {
          clientId: "client-global-medtech",
          client: "Global MedTech Inc.",
          aumChf: 654_000_000,
          netFlow30dChf: -8_000_000,
          nextAction: "Liquidity plan",
          relationshipManager: "R. Li",
        },
      ],
      risks: [
        {
          clientId: "client-global-medtech",
          client: "Global MedTech Inc.",
          issue: "Liquidity gap",
          priority: "High",
          exposureChf: 112_000_000,
          owner: "R. Li",
          dueDate: "2026-05-20",
        },
      ],
      allocation: [],
      trend: [{ label: "May '26", netNewMoneyChf: 562_000_000 }],
    });

    expect(html).toContain("Top Risk Portfolios");
    expect(html).toContain("Global MedTech Inc.");
    expect(html).toContain("Liquidity gap");
    expect(html).toContain("CHF 112M");
    expect(html).toContain("(8M)");
    expect(html).toContain("May '26: CHF 562M");
    expect(html).not.toContain("n/a</div></div>");
  });
});
