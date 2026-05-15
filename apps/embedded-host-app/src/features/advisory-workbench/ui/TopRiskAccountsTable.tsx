import { ChevronRight } from "lucide-react";

import type { TopRiskAccountRow } from "../model/advisory-dashboard.types.js";
import { formatChfCompact } from "./formatters.js";

type TopRiskAccountsTableProps = {
  rows: TopRiskAccountRow[];
};

export function TopRiskAccountsTable({ rows }: TopRiskAccountsTableProps) {
  return (
    <section className="table-card compact-card">
      <div className="table-card-header simple">
        <div className="section-title-row">
          <h2>Top Risk Accounts</h2>
          <span className="result-badge">{rows.length} results</span>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Issue</th>
              <th className="numeric">Exposure (CHF)</th>
              <th>Priority</th>
              <th>Owner</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="client-name">{row.client}</td>
                <td>{row.issue}</td>
                <td className="numeric">{formatChfCompact(row.exposureChf)}</td>
                <td>
                  <span className={`priority priority-${row.priority.toLowerCase()}`}>
                    {row.priority}
                  </span>
                </td>
                <td>{row.owner}</td>
                <td>{row.dueDate}</td>
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
        <span>View all risk accounts</span>
        <ChevronRight size={17} />
      </button>
    </section>
  );
}
