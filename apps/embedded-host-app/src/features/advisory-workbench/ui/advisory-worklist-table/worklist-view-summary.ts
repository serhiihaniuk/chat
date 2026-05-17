import type { HostGridFilter, HostGridSort } from "@side-chat/shared-protocol";

import type { AdvisoryGridViewState } from "../../model/grid-view-state.js";
import type { AdvisoryWorklistRow } from "./worklist-model.js";

const columnLabels: Record<keyof AdvisoryWorklistRow, string> = {
  aumChf: "AUM",
  client: "Client",
  coverageStatus: "Coverage",
  dueDate: "Due Date",
  dueStatus: "Due Status",
  hasAlert: "Alert",
  id: "ID",
  netFlow30dChf: "30D Flow",
  nextAction: "Next Action",
  priority: "Priority",
  relationshipManager: "RM",
  riskExposureChf: "Exposure",
  riskIssue: "Risk / Task",
  riskProfile: "Risk Profile",
  riskScore: "Risk Score",
  segment: "Segment",
  sourceIds: "Sources",
};

export const describeWorklistView = (
  view: AdvisoryGridViewState | undefined,
) => {
  const sortChips = view?.sort?.map(describeSort) ?? [];
  const filterChips = view?.filters?.map(describeFilter) ?? [];
  const chips = [...filterChips, ...sortChips].filter(
    (chip): chip is string => Boolean(chip),
  );

  return chips.length > 0
    ? { label: "AI view", chips }
    : {
        label: "Default queue",
        chips: ["Priority first", "Earliest due date", "Largest outflow"],
      };
};

const describeSort = (sort: HostGridSort) => {
  const label = getColumnLabel(sort.columnId);
  const direction = sort.direction === "asc" ? "A-Z" : "Z-A";
  if (
    sort.columnId.toLowerCase().includes("date") ||
    sort.columnId.toLowerCase().includes("due")
  ) {
    return `${label}: ${sort.direction === "asc" ? "earliest first" : "latest first"}`;
  }
  if (
    sort.columnId.toLowerCase().includes("aum") ||
    sort.columnId.toLowerCase().includes("score") ||
    sort.columnId.toLowerCase().includes("flow") ||
    sort.columnId.toLowerCase().includes("exposure")
  ) {
    return `${label}: ${sort.direction === "asc" ? "low to high" : "high to low"}`;
  }
  return `${label}: ${direction}`;
};

const describeFilter = (filter: HostGridFilter) => {
  const label = getColumnLabel(filter.columnId);
  if (filter.operator === "blank") return `${label}: empty`;
  if (filter.operator === "notBlank") return `${label}: filled`;
  if (filter.operator === "contains") {
    return `${label}: contains ${formatFilterValue(filter.value)}`;
  }
  if (filter.operator === "equals") {
    return `${label}: ${formatFilterValue(filter.value)}`;
  }
  if (filter.operator === "greaterThan") {
    return `${label}: > ${formatFilterValue(filter.value)}`;
  }
  if (filter.operator === "greaterThanOrEqual") {
    return `${label}: >= ${formatFilterValue(filter.value)}`;
  }
  if (filter.operator === "lessThan") {
    return `${label}: < ${formatFilterValue(filter.value)}`;
  }
  if (filter.operator === "lessThanOrEqual") {
    return `${label}: <= ${formatFilterValue(filter.value)}`;
  }
  if (filter.operator === "between" && Array.isArray(filter.value)) {
    return `${label}: ${formatFilterValue(filter.value[0])} - ${formatFilterValue(filter.value[1])}`;
  }
  return `${label}: ${filter.operator}`;
};

const getColumnLabel = (columnId: string) =>
  columnLabels[columnId as keyof AdvisoryWorklistRow] ?? columnId;

const formatFilterValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(formatFilterValue).join(", ");
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value === undefined || value === null || value === "") return "any";
  return String(value);
};
