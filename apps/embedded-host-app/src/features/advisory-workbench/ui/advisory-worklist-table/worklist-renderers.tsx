import { TriangleAlert } from "lucide-react";
import type { ICellRendererParams } from "ag-grid-community";

import type { ClientPortfolioReviewRow } from "../../model/advisory-dashboard.types.js";
import type {
  AdvisoryWorklistRow,
  DueStatus,
} from "../../model/worklist-model.js";

const coverageStatusClass: Record<
  ClientPortfolioReviewRow["coverageStatus"],
  string
> = {
  Covered: "covered",
  Watch: "watch",
  "At Risk": "at-risk",
};

const statusClass = (status: ClientPortfolioReviewRow["coverageStatus"]) =>
  coverageStatusClass[status];

export const CoverageRenderer = ({
  value,
}: ICellRendererParams<
  AdvisoryWorklistRow,
  AdvisoryWorklistRow["coverageStatus"]
>) => {
  const status = value ?? "Covered";
  return (
    <span className={`status-pill ${statusClass(status)}`}>
      <span aria-hidden="true" />
      {status}
    </span>
  );
};

export const PriorityRenderer = ({
  value,
}: ICellRendererParams<
  AdvisoryWorklistRow,
  AdvisoryWorklistRow["priority"]
>) => {
  const priority = value ?? "None";
  return priority === "None" ? (
    <span className="muted-dash">-</span>
  ) : (
    <span className={`priority priority-${priority.toLowerCase()}`}>
      {priority}
    </span>
  );
};

export const DueStatusRenderer = ({
  value,
}: ICellRendererParams<AdvisoryWorklistRow, DueStatus>) => {
  const status = value ?? "Open";
  return (
    <span className={`due-status ${statusToClassName(status)}`}>{status}</span>
  );
};

export const AlertRenderer = ({
  value,
}: ICellRendererParams<AdvisoryWorklistRow, boolean>) =>
  value ? (
    <TriangleAlert className="alert-icon" size={18} aria-label="Alert" />
  ) : (
    <span className="muted-dash">-</span>
  );

const statusToClassName = (status: DueStatus) =>
  status.toLowerCase().replace(/\s+/g, "-");
