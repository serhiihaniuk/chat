import { createPostgresAdvisoryDashboardDb } from "@side-chat/db";

import type {
  HostSurfaceStatePort,
  WorkbenchToolsPort,
} from "#ports/index.js";
import { createWorkbenchSources } from "./workbench-tools/citations.js";
import {
  compactClientPortfolioRows,
  createFallbackDashboardSnapshot,
  fallbackWorkbenchData,
} from "./workbench-tools/fallback-data.js";
import {
  applyWorklistView,
  createSurfaceContextResult,
  createWorklistRows,
  surfaceResourceId,
} from "./workbench-tools/surface-context.js";

/**
 * Workbench tools adapter. This file is the composition point only: it wires
 * the application port to DB-backed reads, deterministic fallback data, source
 * shaping, and host surface state.
 *
 * The heavier logic is split by ownership:
 * - workbench-tools/fallback-data.ts owns demo-safe fallback records.
 * - workbench-tools/citations.ts owns model-visible source metadata.
 * - workbench-tools/surface-context.ts owns Portfolio Worklist view logic.
 */
export const createWorkbenchTools = (
  databaseUrl?: string,
  hostSurfaceState?: HostSurfaceStatePort,
): WorkbenchToolsPort => {
  const advisoryDashboard = databaseUrl
    ? createPostgresAdvisoryDashboardDb(databaseUrl)
    : undefined;

  return {
    async query({ workspaceId, query }) {
      let data: unknown;

      if (advisoryDashboard) {
        switch (query.query) {
          case "dashboard_snapshot":
            data =
              await advisoryDashboard.getAdvisoryDashboardSnapshot(workspaceId);
            break;
          case "client_portfolio_review":
            data = compactClientPortfolioRows(
              await advisoryDashboard.listClientPortfolioReview(workspaceId),
            );
            break;
          case "top_risk_accounts":
            data = await advisoryDashboard.listTopRiskAccounts(workspaceId);
            break;
          case "product_allocation":
            data = await advisoryDashboard.listProductAllocation(workspaceId);
            break;
          case "net_new_money_trend":
            data = await advisoryDashboard.listNetNewMoneyTrend(workspaceId);
            break;
        }
      } else {
        data = fallbackWorkbenchData[query.query];
      }

      return {
        query: query.query,
        workspaceId,
        data,
        sources: createWorkbenchSources(query.query, data),
      };
    },

    async surfaceContext({
      workspaceId,
      userId,
      conversationId,
      resourceId,
      limit,
    }) {
      const resolvedResourceId =
        resourceId === surfaceResourceId ||
        resourceId.toLowerCase().includes("portfolio") ||
        resourceId.toLowerCase().includes("worklist")
          ? surfaceResourceId
          : resourceId;
      const view = await hostSurfaceState?.getGridView({
        workspaceId,
        userId,
        conversationId,
        resourceId: resolvedResourceId,
      });
      const snapshot = advisoryDashboard
        ? await advisoryDashboard.getAdvisoryDashboardSnapshot(workspaceId)
        : createFallbackDashboardSnapshot(workspaceId);
      const rows = createWorklistRows(snapshot);
      const visibleRows = applyWorklistView(rows, view);

      return createSurfaceContextResult(
        workspaceId,
        rows,
        visibleRows,
        view,
        limit,
      );
    },
  };
};
