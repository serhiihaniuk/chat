import type {
  AdvisoryDashboardSnapshot,
  ClientPortfolioReviewRow,
  TopRiskAccountRow,
} from "./advisory-dashboard.types.js";

export type DueStatus = "Overdue" | "Due soon" | "Open" | "No risk";

export type AdvisoryWorklistRow = {
  id: string;
  sourceIds: string[];
  clientId: string;
  client: string;
  segment: string;
  aumChf: number;
  netFlow30dChf: number;
  riskProfile: string;
  riskScore: number;
  coverageStatus: ClientPortfolioReviewRow["coverageStatus"];
  relationshipManager: string;
  nextAction: string;
  hasAlert: boolean;
  riskIssue: string;
  riskExposureChf: number | null;
  priority: TopRiskAccountRow["priority"] | "None";
  dueDate: string;
  dueStatus: DueStatus;
};

export const priorityRank: Record<AdvisoryWorklistRow["priority"], number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  None: 3,
};

export const createWorklistRows = (
  snapshot: AdvisoryDashboardSnapshot,
): AdvisoryWorklistRow[] => {
  const riskByClient = new Map<string, TopRiskAccountRow[]>();
  for (const risk of snapshot.topRiskAccounts) {
    riskByClient.set(risk.clientId, [
      ...(riskByClient.get(risk.clientId) ?? []),
      risk,
    ]);
  }

  return snapshot.clientPortfolioReview.map((client) => {
    const topRisk = [...(riskByClient.get(client.clientId) ?? [])].sort(
      (left, right) =>
        priorityRank[left.priority] - priorityRank[right.priority] ||
        left.dueDate.localeCompare(right.dueDate) ||
        right.exposureChf - left.exposureChf,
    )[0];
    const dueStatus = getDueStatus(topRisk?.dueDate, snapshot.asOfDate);

    return {
      id: client.id,
      sourceIds: [
        `advisoryWorklist:${client.id}`,
        `client_portfolio_review:${client.id}`,
        ...(topRisk ? [`top_risk_accounts:${topRisk.id}`] : []),
      ],
      clientId: client.clientId,
      client: client.client,
      segment: client.segment,
      aumChf: client.aumChf,
      netFlow30dChf: client.netFlow30dChf,
      riskProfile: client.riskProfile,
      riskScore: client.suitabilityScore,
      coverageStatus: client.coverageStatus,
      relationshipManager: client.relationshipManager,
      nextAction: client.nextAction,
      hasAlert: client.hasAlert,
      riskIssue: topRisk?.issue ?? "-",
      riskExposureChf: topRisk?.exposureChf ?? null,
      priority: topRisk?.priority ?? "None",
      dueDate: topRisk?.dueDate ?? "",
      dueStatus,
    };
  });
};

export const getDueStatus = (
  dueDate: string | undefined,
  asOfDate: string,
): DueStatus => {
  if (!dueDate) return "No risk";
  const dueTime = toDateOnlyTime(dueDate);
  const asOfTime = toDateOnlyTime(asOfDate);
  if (dueTime === null || asOfTime === null) return "Open";
  if (dueTime <= asOfTime) return "Overdue";
  if (dueTime <= asOfTime + 7 * 24 * 60 * 60 * 1000) return "Due soon";
  return "Open";
};

export const compareDateValues = (left: unknown, right: unknown) => {
  const leftTime = toDateOnlyTime(left);
  const rightTime = toDateOnlyTime(right);
  if (leftTime === null && rightTime === null) return 0;
  if (leftTime === null) return 1;
  if (rightTime === null) return -1;
  return leftTime - rightTime;
};

export const compareFilterDate = (
  filterLocalDateAtMidnight: Date,
  cellValue: unknown,
) => {
  const filterTime = Date.UTC(
    filterLocalDateAtMidnight.getFullYear(),
    filterLocalDateAtMidnight.getMonth(),
    filterLocalDateAtMidnight.getDate(),
  );
  const cellTime = toDateOnlyTime(cellValue);
  if (cellTime === null) return 1;
  if (cellTime < filterTime) return -1;
  if (cellTime > filterTime) return 1;
  return 0;
};

const toDateOnlyTime = (value: unknown) => {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
};
