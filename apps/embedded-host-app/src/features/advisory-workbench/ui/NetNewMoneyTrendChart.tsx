import { ChevronDown } from "lucide-react";

import type { NetNewMoneyTrendPoint } from "../model/advisory-dashboard.types.js";

type NetNewMoneyTrendChartProps = {
  points: NetNewMoneyTrendPoint[];
};

export function NetNewMoneyTrendChart({ points }: NetNewMoneyTrendChartProps) {
  const width = 520;
  const height = 300;
  const padding = { top: 26, right: 28, bottom: 46, left: 56 };
  const max = 800_000_000;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const yTicks = [0, 200_000_000, 400_000_000, 600_000_000, 800_000_000];
  const coordinates = points.map((point, index) => {
    const x =
      padding.left +
      (points.length <= 1 ? 0 : (chartWidth / (points.length - 1)) * index);
    const y =
      padding.top + chartHeight - (point.netNewMoneyChf / max) * chartHeight;
    return { ...point, x, y };
  });
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <section className="chart-card">
      <div className="table-card-header simple chart-header">
        <h2>Net New Money Trend (CHF)</h2>
        <button
          type="button"
          className="control-button compact"
          aria-disabled="true"
          onClick={(event) => event.preventDefault()}
        >
          <span>Monthly</span>
          <ChevronDown size={16} />
        </button>
      </div>
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Net new money trend from January to June 2025"
      >
        {yTicks.map((tick) => {
          const y = padding.top + chartHeight - (tick / max) * chartHeight;
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                className="chart-gridline"
              />
              <text x={padding.left - 14} y={y + 5} textAnchor="end">
                {tick === 0 ? "0" : `${tick / 1_000_000}M`}
              </text>
            </g>
          );
        })}
        <polyline points={line} className="trend-line" />
        {coordinates.map((point) => (
          <g key={point.id}>
            <circle cx={point.x} cy={point.y} r="5" className="trend-point" />
            <text
              x={point.x}
              y={height - padding.bottom + 28}
              textAnchor="middle"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        <span aria-hidden="true" />
        <span>Net New Money (CHF)</span>
      </div>
    </section>
  );
}
