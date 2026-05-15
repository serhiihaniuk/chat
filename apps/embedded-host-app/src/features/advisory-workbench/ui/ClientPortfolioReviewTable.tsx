import { Columns3, Download, Search, TriangleAlert } from "lucide-react";

import type { ClientPortfolioReviewRow } from "../model/advisory-dashboard.types.js";
import { formatChfCompact, formatSignedChfCompact } from "./formatters.js";

type ClientPortfolioReviewTableProps = {
  rows: ClientPortfolioReviewRow[];
};

const statusClass = (status: ClientPortfolioReviewRow["coverageStatus"]) =>
  status === "Covered" ? "covered" : status === "Watch" ? "watch" : "at-risk";

export function ClientPortfolioReviewTable({
  rows,
}: ClientPortfolioReviewTableProps) {
  return (
    <section className="table-card client-review-card">
      <div className="table-card-header">
        <div className="section-title-row">
          <h2>Client Portfolio Review</h2>
          <span className="result-badge">{rows.length} results</span>
        </div>
        <div className="table-tools">
          <label className="search-field">
            <Search size={18} />
            <span className="sr-only">Search clients</span>
            <input
              type="search"
              placeholder="Search client, RM, segment..."
              readOnly
              onClick={(event) => event.currentTarget.blur()}
            />
          </label>
          <button
            type="button"
            className="control-button compact"
            aria-disabled="true"
            onClick={(event) => event.preventDefault()}
          >
            <Columns3 size={17} />
            <span>Columns</span>
          </button>
          <button
            type="button"
            className="control-icon-button compact"
            aria-label="Export client portfolio review"
            aria-disabled="true"
            onClick={(event) => event.preventDefault()}
          >
            <Download size={18} />
          </button>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Segment</th>
              <th className="numeric">AUM (CHF)</th>
              <th className="numeric">30D Net Flow (CHF)</th>
              <th>Risk Profile</th>
              <th className="numeric">Suitability Score</th>
              <th>Coverage Status</th>
              <th>Last Review</th>
              <th>RM</th>
              <th>Next Action</th>
              <th className="centered">Alert</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="client-name">{row.client}</td>
                <td>{row.segment}</td>
                <td className="numeric">{formatChfCompact(row.aumChf)}</td>
                <td
                  className={`numeric money-flow ${
                    row.netFlow30dChf < 0 ? "negative" : "positive"
                  }`}
                >
                  {formatSignedChfCompact(row.netFlow30dChf)}
                </td>
                <td>{row.riskProfile}</td>
                <td className="numeric">{row.suitabilityScore}</td>
                <td>
                  <span className={`status-pill ${statusClass(row.coverageStatus)}`}>
                    <span aria-hidden="true" />
                    {row.coverageStatus}
                  </span>
                </td>
                <td>{row.lastReview}</td>
                <td>{row.relationshipManager}</td>
                <td>{row.nextAction}</td>
                <td className="centered">
                  {row.hasAlert ? (
                    <TriangleAlert
                      className="alert-icon"
                      size={19}
                      aria-label="Alert"
                    />
                  ) : (
                    <span className="muted-dash">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          Showing 1 to {rows.length} of {rows.length} results
        </span>
        <div className="pagination" aria-label="Pagination">
          <button type="button" disabled aria-label="Previous page">
            ‹
          </button>
          <button type="button" disabled className="current-page">
            1
          </button>
          <button type="button" disabled aria-label="Next page">
            ›
          </button>
        </div>
      </div>
    </section>
  );
}
