import type {
  HostGridFilter,
  HostGridSort,
} from "@side-chat/shared-protocol";

import type { AdvisoryDashboardSnapshot } from "./advisory-dashboard.types.js";
import type { AdvisoryGridViewState } from "./grid-view-state.js";

export type WorkbenchViewQueue =
  | "default"
  | "riskQueue"
  | "priorityFirst"
  | "dueSoon";

export type WorkbenchRiskCategory =
  | "all"
  | "liquidity"
  | "credit"
  | "margin"
  | "concentration"
  | "covenant"
  | "collateral";

export type WorkbenchDueStatus =
  | "all"
  | "Overdue"
  | "Due soon"
  | "Open"
  | "No risk";

export type WorkbenchDueWindow =
  | "all"
  | "today"
  | "thisWeek"
  | "next7"
  | "next14"
  | "thisMonth";

export type WorkbenchPriority = "all" | "High" | "Medium" | "Low";

export type WorkbenchSortId =
  | "aumDesc"
  | "dueAsc"
  | "outflowAsc"
  | "riskExposureDesc"
  | "priorityDue";

export type WorkbenchQuickFilterId =
  | "largestOutflow"
  | "overdue"
  | "highPriority";

export type WorkbenchControlState = {
  viewQueue: WorkbenchViewQueue;
  clientSegment: string;
  priority: WorkbenchPriority;
  riskCategory: WorkbenchRiskCategory;
  dueStatus: WorkbenchDueStatus;
  dueWindow: WorkbenchDueWindow;
  rmAdvisor: string;
  sortBy: WorkbenchSortId;
  quickFilters: WorkbenchQuickFilterId[];
};

export type WorkbenchControlOption<TValue extends string = string> = {
  label: string;
  value: TValue;
};

export const defaultWorkbenchControlState: WorkbenchControlState = {
  viewQueue: "default",
  clientSegment: "all",
  priority: "all",
  riskCategory: "all",
  dueStatus: "all",
  dueWindow: "all",
  rmAdvisor: "all",
  sortBy: "aumDesc",
  quickFilters: [],
};

export const viewQueueOptions = [
  { label: "Default queue", value: "default" },
  { label: "Risk queue", value: "riskQueue" },
  { label: "Priority first", value: "priorityFirst" },
  { label: "Due soon", value: "dueSoon" },
] as const satisfies WorkbenchControlOption<WorkbenchViewQueue>[];

export const priorityOptions = [
  { label: "All priorities", value: "all" },
  { label: "High", value: "High" },
  { label: "Medium", value: "Medium" },
  { label: "Low", value: "Low" },
] as const satisfies WorkbenchControlOption<WorkbenchPriority>[];

export const riskCategoryOptions = [
  { label: "All risk categories", value: "all" },
  { label: "Liquidity", value: "liquidity" },
  { label: "Credit", value: "credit" },
  { label: "Margin", value: "margin" },
  { label: "Concentration", value: "concentration" },
  { label: "Covenant", value: "covenant" },
  { label: "Collateral", value: "collateral" },
] as const satisfies WorkbenchControlOption<WorkbenchRiskCategory>[];

export const dueStatusOptions = [
  { label: "All statuses", value: "all" },
  { label: "Overdue", value: "Overdue" },
  { label: "Due soon", value: "Due soon" },
  { label: "Open", value: "Open" },
  { label: "No risk", value: "No risk" },
] as const satisfies WorkbenchControlOption<WorkbenchDueStatus>[];

export const dueWindowOptions = [
  { label: "All dates", value: "all" },
  { label: "Today", value: "today" },
  { label: "This week", value: "thisWeek" },
  { label: "Next 7 days", value: "next7" },
  { label: "Next 14 days", value: "next14" },
  { label: "This month", value: "thisMonth" },
] as const satisfies WorkbenchControlOption<WorkbenchDueWindow>[];

export const sortOptions = [
  { label: "AUM (High to Low)", value: "aumDesc" },
  { label: "Due date", value: "dueAsc" },
  { label: "Largest outflow", value: "outflowAsc" },
  { label: "Risk exposure", value: "riskExposureDesc" },
  { label: "Priority + due", value: "priorityDue" },
] as const satisfies WorkbenchControlOption<WorkbenchSortId>[];

export const quickFilterOptions = [
  { label: "Largest outflow", value: "largestOutflow" },
  { label: "Overdue", value: "overdue" },
  { label: "High priority", value: "highPriority" },
] as const satisfies WorkbenchControlOption<WorkbenchQuickFilterId>[];

export const createSegmentOptions = (
  snapshot: AdvisoryDashboardSnapshot,
): WorkbenchControlOption[] =>
  createDynamicOptions(
    "All segments",
    snapshot.clientPortfolioReview.map((row) => row.segment),
  );

export const createRmOptions = (
  snapshot: AdvisoryDashboardSnapshot,
): WorkbenchControlOption[] =>
  createDynamicOptions(
    "All RMs",
    snapshot.clientPortfolioReview.map((row) => row.relationshipManager),
  );

export const createWorkbenchControlGridView = (
  state: WorkbenchControlState,
  asOfDate?: string,
): AdvisoryGridViewState => ({
  filters: dedupeFilters(createWorkbenchControlFilters(state, asOfDate)),
  sort: createWorkbenchControlSort(state),
  sequence: Date.now(),
});

export const inferWorkbenchControlStateFromGridView = (
  view: AdvisoryGridViewState | undefined,
  current: WorkbenchControlState = defaultWorkbenchControlState,
  asOfDate?: string,
): WorkbenchControlState => {
  if (!view) return defaultWorkbenchControlState;

  const next: WorkbenchControlState = {
    ...defaultWorkbenchControlState,
    clientSegment: current.clientSegment,
    rmAdvisor: current.rmAdvisor,
  };
  const quickFilters = new Set<WorkbenchQuickFilterId>();

  for (const filter of view.filters ?? []) {
    if (filter.columnId === "segment" && filter.operator === "equals") {
      next.clientSegment = readStringValue(filter.value, "all");
    }
    if (filter.columnId === "priority" && filter.operator === "equals") {
      const priority = readStringValue(filter.value, "all");
      if (isWorkbenchPriority(priority)) next.priority = priority;
      if (priority === "High") quickFilters.add("highPriority");
    }
    if (filter.columnId === "priority" && filter.operator === "notEquals") {
      next.viewQueue = "riskQueue";
    }
    if (filter.columnId === "dueStatus" && filter.operator === "equals") {
      const dueStatus = readStringValue(filter.value, "all");
      if (isWorkbenchDueStatus(dueStatus)) next.dueStatus = dueStatus;
      if (dueStatus === "Overdue") quickFilters.add("overdue");
    }
    if (
      filter.columnId === "relationshipManager" &&
      filter.operator === "equals"
    ) {
      next.rmAdvisor = readStringValue(filter.value, "all");
    }
    if (filter.columnId === "riskIssue" && filter.operator === "contains") {
      next.riskCategory = inferRiskCategory(readStringValue(filter.value, ""));
    }
    if (
      filter.columnId === "netFlow30dChf" &&
      filter.operator === "lessThan"
    ) {
      quickFilters.add("largestOutflow");
    }
  }

  const sort = view.sort?.[0];
  if (sort) next.sortBy = inferSortId(view.sort ?? []);
  next.dueWindow = inferDueWindow(view.filters ?? [], asOfDate);
  next.quickFilters = [...quickFilters];
  return next;
};

export const formatWorkbenchControlSummary = (
  state: WorkbenchControlState,
) => {
  const labels = [
    `View / Queue: ${findOptionLabel(viewQueueOptions, state.viewQueue)}`,
    `Client Segment: ${state.clientSegment === "all" ? "All segments" : state.clientSegment}`,
    `Priority: ${findOptionLabel(priorityOptions, state.priority)}`,
    `Risk Category: ${findOptionLabel(riskCategoryOptions, state.riskCategory)}`,
    `Due Status: ${findOptionLabel(dueStatusOptions, state.dueStatus)}`,
    `Due Window: ${findOptionLabel(dueWindowOptions, state.dueWindow)}`,
    `RM / Advisor: ${state.rmAdvisor === "all" ? "All RMs" : state.rmAdvisor}`,
    `Sort by: ${findOptionLabel(sortOptions, state.sortBy)}`,
  ];
  if (state.quickFilters.length > 0) {
    labels.push(
      `Quick filters: ${state.quickFilters
        .map((filter) => findOptionLabel(quickFilterOptions, filter))
        .join(", ")}`,
    );
  }
  return labels.join("; ");
};

const createDynamicOptions = (
  allLabel: string,
  values: string[],
): WorkbenchControlOption[] => [
  { label: allLabel, value: "all" },
  ...[...new Set(values)]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ label: value, value })),
];

const createWorkbenchControlFilters = (
  state: WorkbenchControlState,
  asOfDate: string | undefined,
): HostGridFilter[] => {
  const filters: HostGridFilter[] = [];

  if (state.viewQueue === "riskQueue") {
    filters.push({ columnId: "priority", operator: "notEquals", value: "None" });
  }
  if (state.viewQueue === "dueSoon") {
    filters.push({ columnId: "dueStatus", operator: "equals", value: "Due soon" });
  }
  if (state.clientSegment !== "all") {
    filters.push({
      columnId: "segment",
      operator: "equals",
      value: state.clientSegment,
    });
  }
  if (state.priority !== "all") {
    filters.push({
      columnId: "priority",
      operator: "equals",
      value: state.priority,
    });
  }
  if (state.riskCategory !== "all") {
    filters.push({
      columnId: "riskIssue",
      operator: "contains",
      value: getRiskCategoryFilterValue(state.riskCategory),
    });
  }
  if (state.dueStatus !== "all") {
    filters.push({
      columnId: "dueStatus",
      operator: "equals",
      value: state.dueStatus,
    });
  }
  const dueWindowFilter = createDueWindowFilter(state.dueWindow, asOfDate);
  if (dueWindowFilter) filters.push(dueWindowFilter);
  if (state.rmAdvisor !== "all") {
    filters.push({
      columnId: "relationshipManager",
      operator: "equals",
      value: state.rmAdvisor,
    });
  }
  if (state.quickFilters.includes("largestOutflow")) {
    filters.push({ columnId: "netFlow30dChf", operator: "lessThan", value: 0 });
  }
  if (state.quickFilters.includes("overdue")) {
    filters.push({ columnId: "dueStatus", operator: "equals", value: "Overdue" });
  }
  if (state.quickFilters.includes("highPriority")) {
    filters.push({ columnId: "priority", operator: "equals", value: "High" });
  }

  return filters;
};

const createDueWindowFilter = (
  dueWindow: WorkbenchDueWindow,
  asOfDate: string | undefined,
): HostGridFilter | undefined => {
  const range = createDueWindowRange(dueWindow, asOfDate);
  if (!range) return undefined;
  return {
    columnId: "dueDate",
    operator: "between",
    value: range,
  };
};

const createWorkbenchControlSort = (
  state: WorkbenchControlState,
): HostGridSort[] => {
  if (state.viewQueue === "priorityFirst") {
    return [
      { columnId: "priority", direction: "asc" },
      { columnId: "dueDate", direction: "asc" },
    ];
  }

  switch (state.sortBy) {
    case "dueAsc":
      return [{ columnId: "dueDate", direction: "asc" }];
    case "outflowAsc":
      return [{ columnId: "netFlow30dChf", direction: "asc" }];
    case "riskExposureDesc":
      return [{ columnId: "riskExposureChf", direction: "desc" }];
    case "priorityDue":
      return [
        { columnId: "priority", direction: "asc" },
        { columnId: "dueDate", direction: "asc" },
      ];
    case "aumDesc":
      return [{ columnId: "aumChf", direction: "desc" }];
  }
};

const dedupeFilters = (filters: HostGridFilter[]) => {
  const seen = new Set<string>();
  return filters.filter((filter) => {
    const key = `${filter.columnId}:${filter.operator}:${String(filter.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getRiskCategoryFilterValue = (category: WorkbenchRiskCategory) => {
  if (category === "all") return "";
  if (category === "concentration") return "concentration";
  return category;
};

const readStringValue = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;

const isWorkbenchPriority = (value: string): value is WorkbenchPriority =>
  priorityOptions.some((option) => option.value === value);

const isWorkbenchDueStatus = (value: string): value is WorkbenchDueStatus =>
  dueStatusOptions.some((option) => option.value === value);

const inferRiskCategory = (value: string): WorkbenchRiskCategory => {
  const normalized = value.toLowerCase();
  if (normalized.includes("liquidity")) return "liquidity";
  if (normalized.includes("credit")) return "credit";
  if (normalized.includes("margin")) return "margin";
  if (normalized.includes("concentration")) return "concentration";
  if (normalized.includes("covenant")) return "covenant";
  if (normalized.includes("collateral")) return "collateral";
  return "all";
};

const inferDueWindow = (
  filters: HostGridFilter[],
  asOfDate?: string,
): WorkbenchDueWindow => {
  const dueDateFilter = filters.find(
    (filter) => filter.columnId === "dueDate" && filter.operator === "between",
  );
  if (!Array.isArray(dueDateFilter?.value)) return "all";

  const [from, to] = dueDateFilter.value.map((value) => String(value));
  const referenceDate = asOfDate ?? todayIsoDate();
  if (matchesDueWindowRange(from, to, "today", referenceDate)) return "today";
  if (matchesDueWindowRange(from, to, "thisWeek", referenceDate)) return "thisWeek";
  if (matchesDueWindowRange(from, to, "next7", referenceDate)) return "next7";
  if (matchesDueWindowRange(from, to, "next14", referenceDate)) return "next14";
  if (matchesDueWindowRange(from, to, "thisMonth", referenceDate)) return "thisMonth";
  return "all";
};

const matchesDueWindowRange = (
  from: string,
  to: string,
  dueWindow: WorkbenchDueWindow,
  asOfDate: string,
) => {
  const range = createDueWindowRange(dueWindow, asOfDate);
  return Boolean(range && range[0] === from && range[1] === to);
};

const inferSortId = (sort: HostGridSort[]): WorkbenchSortId => {
  const first = sort[0];
  const second = sort[1];
  if (first?.columnId === "dueDate" && first.direction === "asc") {
    return "dueAsc";
  }
  if (first?.columnId === "netFlow30dChf" && first.direction === "asc") {
    return "outflowAsc";
  }
  if (first?.columnId === "riskExposureChf" && first.direction === "desc") {
    return "riskExposureDesc";
  }
  if (
    first?.columnId === "priority" &&
    first.direction === "asc" &&
    second?.columnId === "dueDate"
  ) {
    return "priorityDue";
  }
  return "aumDesc";
};

const findOptionLabel = <TValue extends string>(
  options: readonly WorkbenchControlOption<TValue>[],
  value: TValue,
) => options.find((option) => option.value === value)?.label ?? value;

export const createDueWindowRange = (
  dueWindow: WorkbenchDueWindow,
  asOfDate: string | undefined,
) => {
  if (dueWindow === "all") return undefined;
  const start = parseDateOnly(asOfDate) ?? parseDateOnly(todayIsoDate());
  if (!start) return undefined;

  if (dueWindow === "today") {
    return [formatIsoDate(start), formatIsoDate(start)] as const;
  }
  if (dueWindow === "next7") {
    return [formatIsoDate(start), formatIsoDate(addDays(start, 7))] as const;
  }
  if (dueWindow === "next14") {
    return [formatIsoDate(start), formatIsoDate(addDays(start, 14))] as const;
  }
  if (dueWindow === "thisWeek") {
    return [formatIsoDate(startOfWeek(start)), formatIsoDate(endOfWeek(start))] as const;
  }
  return [formatIsoDate(startOfMonth(start)), formatIsoDate(endOfMonth(start))] as const;
};

const parseDateOnly = (value: string | undefined) => {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  const date = new Date(parsed);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const dayMs = 24 * 60 * 60 * 1000;

const addDays = (value: number, days: number) => value + days * dayMs;

const startOfWeek = (value: number) => {
  const date = new Date(value);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(value, mondayOffset);
};

const endOfWeek = (value: number) => addDays(startOfWeek(value), 6);

const startOfMonth = (value: number) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};

const endOfMonth = (value: number) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0);
};

const todayIsoDate = () => formatIsoDate(Date.now());

const formatIsoDate = (value: number) => new Date(value).toISOString().slice(0, 10);
