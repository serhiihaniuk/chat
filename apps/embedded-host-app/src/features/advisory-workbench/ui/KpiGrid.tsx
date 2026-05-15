import { ArrowDown, ArrowUp, Info } from "lucide-react";

import type { AdvisoryKpi } from "../model/advisory-dashboard.types.js";

type KpiGridProps = {
  kpis: AdvisoryKpi[];
};

export function KpiGrid({ kpis }: KpiGridProps) {
  return (
    <section className="kpi-grid" aria-label="Advisory KPIs">
      {kpis.map((kpi) => {
        const isNegative = kpi.trend === "negative";
        const TrendIcon = isNegative ? ArrowUp : ArrowUp;
        return (
          <article className="kpi-card" key={kpi.id}>
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
