import { ChevronRight } from "lucide-react";

import type { ProductAllocationRow } from "../model/advisory-dashboard.types.js";
import { formatDrift, formatPercent } from "./formatters.js";

type ProductAllocationTableProps = {
  rows: ProductAllocationRow[];
};

export function ProductAllocationTable({ rows }: ProductAllocationTableProps) {
  return (
    <section className="table-card compact-card">
      <div className="table-card-header simple">
        <div className="section-title-row">
          <h2>Product Allocation Overview</h2>
          <span className="result-badge">{rows.length} results</span>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Asset Class</th>
              <th className="numeric">Current %</th>
              <th className="numeric">Target %</th>
              <th className="numeric">Drift</th>
              <th>Recommended Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="client-name">{row.assetClass}</td>
                <td className="numeric">{formatPercent(row.currentPercent)}</td>
                <td className="numeric">{formatPercent(row.targetPercent)}</td>
                <td
                  className={`numeric drift ${
                    row.driftPp < 0
                      ? "negative"
                      : row.driftPp > 0
                        ? "positive"
                        : "neutral"
                  }`}
                >
                  {formatDrift(row.driftPp)}
                </td>
                <td>{row.recommendedAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="text-action"
        aria-disabled="true"
        onClick={(event) => event.preventDefault()}
      >
        <span>View full asset allocation</span>
        <ChevronRight size={17} />
      </button>
    </section>
  );
}
