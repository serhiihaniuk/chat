import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  parseHostCommand,
  validateHostCommand,
  type HostCommand,
  type HostContextSnapshot,
  type HostGridFilter,
  type HostGridSort,
  type HostResource,
} from "@side-chat/shared-protocol";

/**
 * Model-facing host command adapter. This module owns the translation from a
 * small, LLM-friendly tool schema into the real sidechat.v1 host command
 * protocol. Provider adapters may expose this schema, but they should not know
 * grid/filter/sort semantics themselves.
 */
const hostCommandActionNames = [
  "apply_workbench_controls",
  "clear_workbench_controls",
  "apply_grid_view",
  "clear_grid_view",
  "focus_resource",
] as const;

const hostGridFilterOperatorNames = [
  "equals",
  "notEquals",
  "contains",
  "startsWith",
  "endsWith",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
  "between",
  "in",
  "blank",
  "notBlank",
] as const;

const workbenchViewQueueNames = [
  "default",
  "riskQueue",
  "priorityFirst",
  "dueSoon",
] as const;

const workbenchPriorityNames = [
  "all",
  "High",
  "Medium",
  "Low",
] as const;

const workbenchRiskCategoryNames = [
  "all",
  "liquidity",
  "credit",
  "margin",
  "concentration",
  "covenant",
  "collateral",
] as const;

const workbenchDueStatusNames = [
  "all",
  "Overdue",
  "Due soon",
  "Open",
  "No risk",
] as const;

const workbenchSortNames = [
  "aumDesc",
  "dueAsc",
  "outflowAsc",
  "riskExposureDesc",
  "priorityDue",
] as const;

const workbenchQuickFilterNames = [
  "largestOutflow",
  "overdue",
  "highPriority",
] as const;

export const hostCommandToolDescription = [
  "Control the visible UBS Partner Advisory Workbench UI.",
  "The top Workbench command bar is the primary page-control surface for humans and the assistant.",
  "Use apply_workbench_controls whenever the user asks to show, filter, sort, prioritize, queue, or change the current Workbench page using View / Queue, Client Segment, Priority, Risk Category, Due Status, RM / Advisor, Sort by, or quick filters.",
  "Common mappings: risk queue -> workbenchViewQueue riskQueue; priority first -> workbenchViewQueue priorityFirst; due soon -> workbenchViewQueue dueSoon or dueStatus Due soon; overdue -> dueStatus Overdue or quickFilters overdue; high priority -> priority High or quickFilters highPriority; largest outflow/outflows -> quickFilters largestOutflow and sortBy outflowAsc; biggest AUM -> sortBy aumDesc; due first -> sortBy dueAsc; risk exposure -> sortBy riskExposureDesc; priority due -> sortBy priorityDue.",
  "For apply_workbench_controls, set resourceId to advisoryWorkbenchControls, keep filters and sort empty, fill every command-bar field, use all for unchanged dropdown controls, and use [] when there are no quick filters.",
  "Use generic apply_grid_view only for precise column-level views that the command bar cannot express.",
].join(" ");

export const hostCommandInputSchema = z.object({
  action: z
    .enum(hostCommandActionNames)
    .describe(
      "UI action to request. Use apply_workbench_controls first for normal Workbench page control through the top command bar. Use apply_grid_view only for a precise grid operation not expressible by the command bar.",
    ),
  resourceId: z
    .string()
    .min(1)
    .describe(
      "The resource id from host context. For apply_workbench_controls or clear_workbench_controls use advisoryWorkbenchControls. For generic grid actions use the grid resource id.",
    ),
  filters: z
    .array(
      z.object({
        columnId: z.string().min(1),
        operator: z.enum(hostGridFilterOperatorNames),
        value: z
          .string()
          .describe(
            "Visible filter value. Use an empty string for blank/notBlank. Use comma-separated values for between or in.",
          ),
      }),
    )
    .describe(
      "Generic grid filters to apply. For apply_workbench_controls keep this [] and use the command-bar fields instead.",
    ),
  sort: z
    .array(
      z.object({
        columnId: z.string().min(1),
        direction: z.enum(["asc", "desc"]),
      }),
    )
    .describe(
      "Generic grid sort rules to apply. For apply_workbench_controls keep this [] and use sortBy instead.",
    ),
  highlightRowIds: z
    .array(z.string().min(1))
    .describe("Row ids to highlight. Use [] when no row highlight is needed."),
  workbenchViewQueue: z
    .enum(workbenchViewQueueNames)
    .describe(
      "Top command bar View / Queue control. Use riskQueue for the risk queue, priorityFirst for priority-first work, dueSoon for due-soon work, and default when unchanged.",
    ),
  clientSegment: z
    .string()
    .describe(
      "Top command bar Client Segment selected value, such as all, Corporate, UHNW, HNW, or Institutional. Use all when unchanged.",
    ),
  priority: z
    .enum(workbenchPriorityNames)
    .describe(
      "Top command bar Priority selected value. Use High for high-priority requests, Medium or Low when requested, and all when unchanged.",
    ),
  riskCategory: z
    .enum(workbenchRiskCategoryNames)
    .describe(
      "Top command bar Risk Category selected value. Map liquidity, credit, margin, concentration, covenant, and collateral risk wording to the matching value. Use all when unchanged.",
    ),
  dueStatus: z
    .enum(workbenchDueStatusNames)
    .describe(
      "Top command bar Due Status selected value. Use Overdue, Due soon, Open, or No risk when the user asks for that status; use all when unchanged.",
    ),
  relationshipManager: z
    .string()
    .describe(
      "Top command bar RM / Advisor selected value, such as R. Li or H. Mueller. Use all when unchanged.",
    ),
  sortBy: z
    .enum(workbenchSortNames)
    .describe(
      "Top command bar Sort by selected value. Use aumDesc for AUM high to low, dueAsc for earliest due date, outflowAsc for largest outflow, riskExposureDesc for highest risk exposure, and priorityDue for priority plus due date.",
    ),
  quickFilters: z
    .array(z.enum(workbenchQuickFilterNames))
    .describe(
      "Top command bar quick filter pills. Use largestOutflow, overdue, and/or highPriority for those quick page filters; use [] when none are requested.",
    ),
  reason: z
    .string()
    .trim()
    .max(160)
    .describe("Short private reason for the UI action."),
});

export const hostCommandToolOutputSchema = z.object({
  commandId: z.string().min(1),
  command: z.unknown(),
  reason: z.string().optional(),
});

export type HostCommandToolInput = z.infer<typeof hostCommandInputSchema>;

const normalizeHostLookupKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const findHostResource = (
  hostContext: HostContextSnapshot | undefined,
  resourceId: string,
) => {
  const resources = hostContext?.resources ?? [];
  const requested = normalizeHostLookupKey(resourceId);
  const matched = resources.find(
    (resource) =>
      normalizeHostLookupKey(resource.id) === requested ||
      normalizeHostLookupKey(resource.label) === requested,
  );

  return matched ?? (resources.length === 1 ? resources[0] : undefined);
};

const findHostColumnId = (
  resource: HostResource | undefined,
  columnId: string,
) => {
  const columns = resource?.columns ?? [];
  const requested = normalizeHostLookupKey(columnId);
  const matched = columns.find(
    (column) =>
      normalizeHostLookupKey(column.id) === requested ||
      normalizeHostLookupKey(column.label) === requested,
  );

  return matched?.id;
};

const parseHostFilterScalar = (value: string) => {
  const normalized = value.trim();
  if (/^(true|false)$/i.test(normalized)) return /^true$/i.test(normalized);
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  return normalized;
};

const parseHostFilterValue = (
  operator: HostCommandToolInput["filters"][number]["operator"],
  value: string,
) => {
  if (operator === "blank" || operator === "notBlank") return undefined;

  if (operator === "between" || operator === "in") {
    return value
      .split(",")
      .map((item) => parseHostFilterScalar(item))
      .filter((item) => item !== "");
  }

  return parseHostFilterScalar(value);
};

type ResolveHostColumnId = (columnId: string) => string;

const toGridFilter = (
  filter: HostCommandToolInput["filters"][number],
  resolveColumnId: ResolveHostColumnId,
) => {
  const value = parseHostFilterValue(filter.operator, filter.value);
  const baseFilter = {
    columnId: resolveColumnId(filter.columnId),
    operator: filter.operator,
  };

  if (value === undefined) return baseFilter;
  return { ...baseFilter, value };
};

const toGridSortRule = (
  sort: HostCommandToolInput["sort"][number],
  resolveColumnId: ResolveHostColumnId,
) => ({
  ...sort,
  columnId: resolveColumnId(sort.columnId),
});

const createApplyGridViewCommand = (
  input: HostCommandToolInput,
  resourceId: string,
  resolveColumnId: ResolveHostColumnId,
) => ({
  type: "grid.applyView" as const,
  resourceId,
  view: {
    filters: input.filters.map((filter) =>
      toGridFilter(filter, resolveColumnId),
    ),
    sort: input.sort.map((sort) => toGridSortRule(sort, resolveColumnId)),
    highlightRowIds: input.highlightRowIds,
  },
});

const createApplyWorkbenchControlsCommand = (
  input: HostCommandToolInput,
  resourceId: string,
) => ({
  type: "grid.applyView" as const,
  resourceId,
  view: {
    filters: createWorkbenchControlFilters(input),
    sort: createWorkbenchControlSort(input),
    highlightRowIds: input.highlightRowIds,
  },
});

const createHostCommand = (
  input: HostCommandToolInput,
  resourceId: string,
  resolveColumnId: ResolveHostColumnId,
) => {
  switch (input.action) {
    case "clear_workbench_controls":
      return {
        type: "grid.clearView" as const,
        resourceId,
      };

    case "clear_grid_view":
      return {
        type: "grid.clearView" as const,
        resourceId,
      };

    case "focus_resource":
      return {
        type: "ui.focusResource" as const,
        resourceId,
      };

    case "apply_grid_view":
      return createApplyGridViewCommand(input, resourceId, resolveColumnId);

    case "apply_workbench_controls":
      return createApplyWorkbenchControlsCommand(input, resourceId);
  }
};

export const toHostCommand = (
  input: HostCommandToolInput,
  hostContext?: HostContextSnapshot,
): HostCommand => {
  const isWorkbenchControlAction =
    input.action === "apply_workbench_controls" ||
    input.action === "clear_workbench_controls";
  const resource = isWorkbenchControlAction
    ? findHostResource(hostContext, "advisoryWorklist")
    : findHostResource(hostContext, input.resourceId);
  const resourceId =
    resource?.id ?? (isWorkbenchControlAction ? "advisoryWorklist" : input.resourceId);

  const resolveColumnId = (columnId: string) => {
    const resolved = findHostColumnId(resource, columnId);
    if (!resolved && resource) {
      throw new Error(`Unknown host resource column: ${columnId}`);
    }
    return resolved ?? columnId;
  };

  const command = createHostCommand(input, resourceId, resolveColumnId);

  return parseHostCommand(command);
};

const createWorkbenchControlFilters = (
  input: HostCommandToolInput,
): HostGridFilter[] => {
  const filters: HostGridFilter[] = [];
  const viewQueue = input.workbenchViewQueue ?? "default";
  const clientSegment = normalizeControlValue(input.clientSegment);
  const relationshipManager = normalizeControlValue(input.relationshipManager);
  const quickFilters = input.quickFilters;

  if (viewQueue === "riskQueue") {
    filters.push({ columnId: "priority", operator: "notEquals", value: "None" });
  }
  if (viewQueue === "dueSoon") {
    filters.push({ columnId: "dueStatus", operator: "equals", value: "Due soon" });
  }
  if (!isAllControlValue(clientSegment)) {
    filters.push({ columnId: "segment", operator: "equals", value: clientSegment });
  }
  if (input.priority && input.priority !== "all") {
    filters.push({ columnId: "priority", operator: "equals", value: input.priority });
  }
  if (input.riskCategory && input.riskCategory !== "all") {
    filters.push({
      columnId: "riskIssue",
      operator: "contains",
      value: input.riskCategory,
    });
  }
  if (input.dueStatus && input.dueStatus !== "all") {
    filters.push({ columnId: "dueStatus", operator: "equals", value: input.dueStatus });
  }
  if (!isAllControlValue(relationshipManager)) {
    filters.push({
      columnId: "relationshipManager",
      operator: "equals",
      value: relationshipManager,
    });
  }
  if (quickFilters.includes("largestOutflow")) {
    filters.push({ columnId: "netFlow30dChf", operator: "lessThan", value: 0 });
  }
  if (quickFilters.includes("overdue")) {
    filters.push({ columnId: "dueStatus", operator: "equals", value: "Overdue" });
  }
  if (quickFilters.includes("highPriority")) {
    filters.push({ columnId: "priority", operator: "equals", value: "High" });
  }

  return dedupeFilters(filters);
};

const createWorkbenchControlSort = (
  input: HostCommandToolInput,
): HostGridSort[] => {
  if (input.workbenchViewQueue === "priorityFirst") {
    return [
      { columnId: "priority", direction: "asc" },
      { columnId: "dueDate", direction: "asc" },
    ];
  }

  switch (input.sortBy ?? "aumDesc") {
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

const normalizeControlValue = (value: string | undefined) =>
  value?.trim() || "all";

const isAllControlValue = (value: string) =>
  value.toLowerCase() === "all" || value.toLowerCase().startsWith("all ");

const dedupeFilters = (
  filters: HostGridFilter[],
) => {
  const seen = new Set<string>();
  return filters.filter((filter) => {
    const key = `${filter.columnId}:${filter.operator}:${String(filter.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const createHostCommandToolOutput = (
  input: HostCommandToolInput,
  hostContext?: HostContextSnapshot,
) => ({
  commandId: randomUUID(),
  command: toHostCommand(input, hostContext),
  reason: input.reason,
});

export const parseHostCommandToolOutput = (output: unknown) => {
  const parsed = hostCommandToolOutputSchema.safeParse(output);
  if (!parsed.success) return undefined;

  const command = validateHostCommand(parsed.data.command);
  if (!command.ok) return undefined;

  return {
    commandId: parsed.data.commandId,
    command: command.data,
  };
};
