import {
  createPostgresAdvisoryDashboardDb,
} from "@side-chat/db";
import { Hono } from "hono";

import type { AdvisoryDashboardReader } from "./advisory-dashboard-port.js";
import { parseConfig } from "./config.js";

/**
 * Dashboard data HTTP adapter. It owns read-only JSON routes for the host app
 * and delegates all data access to AdvisoryDashboardReader.
 */
export type DashboardDataDeps = {
  advisoryDashboard: AdvisoryDashboardReader;
};

const getWorkspaceId = (url: URL) =>
  url.searchParams.get("workspaceId")?.trim() || "demo-workspace";

export const createApp = (deps?: DashboardDataDeps) => {
  const app = new Hono();
  const resolvedDeps =
    deps ??
    (() => {
      const config = parseConfig();
      return {
        advisoryDashboard: createPostgresAdvisoryDashboardDb(
          config.DATABASE_URL,
        ),
      };
    })();

  app.get("/dashboard-health", (context) =>
    context.json({ ok: true, service: "dashboard-data-api" }),
  );

  app.get("/advisory-dashboard/snapshot", async (context) => {
    const workspaceId = getWorkspaceId(new URL(context.req.url));
    const snapshot =
      await resolvedDeps.advisoryDashboard.getAdvisoryDashboardSnapshot(
        workspaceId,
      );
    return context.json(snapshot);
  });

  app.get("/advisory-dashboard/clients", async (context) => {
    const workspaceId = getWorkspaceId(new URL(context.req.url));
    return context.json(
      await resolvedDeps.advisoryDashboard.listClientPortfolioReview(
        workspaceId,
      ),
    );
  });

  app.get("/advisory-dashboard/risk-accounts", async (context) => {
    const workspaceId = getWorkspaceId(new URL(context.req.url));
    return context.json(
      await resolvedDeps.advisoryDashboard.listTopRiskAccounts(workspaceId),
    );
  });

  app.get("/advisory-dashboard/product-allocation", async (context) => {
    const workspaceId = getWorkspaceId(new URL(context.req.url));
    return context.json(
      await resolvedDeps.advisoryDashboard.listProductAllocation(workspaceId),
    );
  });

  app.get("/advisory-dashboard/net-new-money-trend", async (context) => {
    const workspaceId = getWorkspaceId(new URL(context.req.url));
    return context.json(
      await resolvedDeps.advisoryDashboard.listNetNewMoneyTrend(workspaceId),
    );
  });

  return app;
};

export default createApp;
