import { ArrowDown, ArrowUp, Info } from "lucide-react";

import type { AdvisoryKpi } from "../model/advisory-dashboard.types.js";

type KpiGridProps = {
  activeSourceId?: string | null;
  kpis: AdvisoryKpi[];
};

const kpiSourceField: Record<string, string> = {
  "kpi-total-aum": "totalAum",
  "kpi-net-new-money": "netNewMoney",
  "kpi-advisory-coverage": "advisoryCoverage",
  "kpi-at-risk-accounts": "atRiskAccounts",
  "kpi-client-meetings": "clientMeetings",
  "kpi-compliance-alerts": "complianceAlerts",
};

export function KpiGrid({ activeSourceId, kpis }: KpiGridProps) {
  return (
    <section className="kpi-grid" aria-label="Advisory KPIs">
      {kpis.map((kpi) => {
        const isNegative = kpi.trend === "negative";
        const TrendIcon = isNegative ? ArrowUp : ArrowUp;
        const sourceId = `dashboard_snapshot:${kpiSourceField[kpi.id] ?? kpi.id}`;
        return (
          <article
            className="kpi-card"
            data-citation-active={activeSourceId === sourceId}
            data-sidechat-source-id={sourceId}
            key={kpi.id}
          >
            <div className="kpi-label-row">
              <h2>{kpi.label}</h2>
              <Info size={17} aria-hidden="true" />
            </div>
            <strong>{kpi.value}</strong>
            <p className={`kpi-delta is-${kpi.trend}`}>
              {isNegative ? <ArrowUp size={16} /> : <TrendIcon size={16} />}
              <span>{kpi.delta}</span>
            </p>
          </article>
        );
      })}
    </section>
  );
}
