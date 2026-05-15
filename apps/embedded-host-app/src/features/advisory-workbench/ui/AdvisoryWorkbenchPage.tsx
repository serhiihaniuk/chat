import { useEffect, useState } from "react";

import { getAdvisoryDashboardSnapshot } from "../api/advisory-dashboard-client.js";
import type { AdvisoryDashboardSnapshot } from "../model/advisory-dashboard.types.js";
import { ClientPortfolioReviewTable } from "./ClientPortfolioReviewTable.js";
import { HeaderControls } from "./HeaderControls.js";
import { KpiGrid } from "./KpiGrid.js";
import { NetNewMoneyTrendChart } from "./NetNewMoneyTrendChart.js";
import { ProductAllocationTable } from "./ProductAllocationTable.js";
import { Sidebar } from "./Sidebar.js";
import { TopRiskAccountsTable } from "./TopRiskAccountsTable.js";

const workspaceId = "demo-workspace";

export function AdvisoryWorkbenchPage() {
  const [snapshot, setSnapshot] = useState<AdvisoryDashboardSnapshot | null>(
    null,
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    getAdvisoryDashboardSnapshot(workspaceId, controller.signal)
      .then((data) => {
        setSnapshot(data);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setStatus("error");
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="workbench-shell">
      <Sidebar />
      <div className="workbench-main">
        <header className="workbench-header">
          <div>
            <p className="product-label">UBS Partner</p>
            <h1>Advisory Workbench</h1>
            <p className="header-subtitle">
              Real-time overview of relationships, portfolio performance,
              advisory coverage, and risk.
            </p>
          </div>
          <HeaderControls
            dateRangeLabel={snapshot?.dateRange.label ?? "Apr 1 - Jun 30, 2025"}
          />
        </header>

        {status === "loading" ? (
          <div className="dashboard-state" role="status">
            Loading advisory dashboard...
          </div>
        ) : null}

        {status === "error" ? (
          <div className="dashboard-state error" role="alert">
            Advisory dashboard data is unavailable.
          </div>
        ) : null}

        {snapshot ? (
          <>
            <KpiGrid kpis={snapshot.kpis} />
            <ClientPortfolioReviewTable
              rows={snapshot.clientPortfolioReview}
            />
            <div className="bottom-grid">
              <TopRiskAccountsTable rows={snapshot.topRiskAccounts} />
              <ProductAllocationTable rows={snapshot.productAllocation} />
              <NetNewMoneyTrendChart points={snapshot.netNewMoneyTrend} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
