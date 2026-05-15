import type { AdvisoryDashboardSnapshot } from "../model/advisory-dashboard.types.js";
import { formatChfCompact } from "./formatters.js";

type WorkbenchInsightRailProps = {
  snapshot: AdvisoryDashboardSnapshot;
};

const priorityOrder = ["High", "Medium", "Low"] as const;

export function WorkbenchInsightRail({ snapshot }: WorkbenchInsightRailProps) {
  const priorityCounts = priorityOrder.map((priority) => ({
    label: priority,
    value: snapshot.topRiskAccounts.filter((risk) => risk.priority === priority)
      .length,
  }));
  const riskClientIds = new Set(
    snapshot.topRiskAccounts.map((risk) => risk.clientId),
  );
  const noRiskCount = Math.max(
    snapshot.clientPortfolioReview.length - riskClientIds.size,
    0,
  );
  const priorityTotal =
    priorityCounts.reduce((total, item) => total + item.value, 0) + noRiskCount;
  const highestExposure = [...snapshot.topRiskAccounts].sort(
    (left, right) => right.exposureChf - left.exposureChf,
  )[0];
  const latestMoneyPoint = snapshot.netNewMoneyTrend.at(-1);
  const previousMoneyPoint = snapshot.netNewMoneyTrend.at(-2);
  const moneyDelta =
    latestMoneyPoint && previousMoneyPoint
      ? latestMoneyPoint.netNewMoneyChf - previousMoneyPoint.netNewMoneyChf
      : 0;
  const maxMoneyPoint = Math.max(
    ...snapshot.netNewMoneyTrend.map((point) => point.netNewMoneyChf),
    1,
  );

  return (
    <aside className="insight-rail" aria-label="Workbench insights">
      <section className="insight-card">
        <div className="insight-card-header">
          <h2>Risk Mix</h2>
          <span>{priorityTotal} clients</span>
        </div>
        <div className="priority-bars">
          {[...priorityCounts, { label: "No risk", value: noRiskCount }].map(
            (item) => (
              <div className="priority-bar-row" key={item.label}>
                <span>{item.label}</span>
                <div className="priority-track" aria-hidden="true">
                  <span
                    className={`priority-fill priority-fill-${item.label
                      .toLowerCase()
                      .replace(/\s+/g, "-")}`}
                    style={{
                      width: `${Math.round((item.value / priorityTotal) * 100)}%`,
                    }}
                  />
                </div>
                <strong>{item.value}</strong>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="insight-card accent-card">
        <div className="insight-card-header">
          <h2>Largest Exposure</h2>
          <span>Risk queue</span>
        </div>
        {highestExposure ? (
          <>
            <strong className="insight-primary">{highestExposure.client}</strong>
            <p>{highestExposure.issue}</p>
            <span className="insight-metric">
              {formatChfCompact(highestExposure.exposureChf)}
            </span>
          </>
        ) : null}
      </section>

      <section className="insight-card">
        <div className="insight-card-header">
          <h2>Money Momentum</h2>
          <span>{latestMoneyPoint?.label}</span>
        </div>
        <div className="spark-bars" aria-hidden="true">
          {snapshot.netNewMoneyTrend.map((point) => (
            <span
              key={point.id}
              style={{
                height: `${Math.max(
                  18,
                  Math.round((point.netNewMoneyChf / maxMoneyPoint) * 72),
                )}px`,
              }}
            />
          ))}
        </div>
        <p className={moneyDelta >= 0 ? "insight-positive" : "insight-negative"}>
          {moneyDelta >= 0 ? "+" : ""}
          {formatChfCompact(moneyDelta)} vs prior month
        </p>
      </section>
    </aside>
  );
}
