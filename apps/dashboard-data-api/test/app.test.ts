import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { parseConfig } from "../src/config.js";
import { createFixtureAdvisoryDashboardReader } from "../src/fixture-dashboard.js";

describe("dashboard data api", () => {
  it("serves advisory dashboard data through an injected reader port", async () => {
    const app = createApp({
      advisoryDashboard: createFixtureAdvisoryDashboardReader(),
    });

    const response = await app.request(
      "/advisory-dashboard/snapshot?workspaceId=demo-workspace",
    );
    const snapshot = await response.json();

    expect(response.status).toBe(200);
    expect(snapshot).toMatchObject({
      workspaceId: "demo-workspace",
      dateRange: { label: "Apr 1 - Jun 30, 2025" },
    });
    expect(snapshot.kpis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "kpi-total-aum", value: "CHF 24.8B" }),
      ]),
    );
  });

  it("parses fixture mode for local e2e runs", () => {
    expect(
      parseConfig({
        DASHBOARD_DATA_SOURCE: "fixture",
      } as NodeJS.ProcessEnv),
    ).toMatchObject({
      DASHBOARD_DATA_SOURCE: "fixture",
      PORT: 3100,
    });
  });
});
