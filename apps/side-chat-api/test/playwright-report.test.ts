import { describe, expect, it } from "vitest";
import { createAnalystNoteParagraphs } from "../src/adapters/reports/playwright-report.js";

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
});
