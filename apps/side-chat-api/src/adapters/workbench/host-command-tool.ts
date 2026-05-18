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

const workbenchDueWindowNames = [
  "all",
  "today",
  "thisWeek",
  "next7",
  "next14",
  "thisMonth",
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
  "Control the visible Advisory Dashboard UI.",
  "The top Workbench command bar is the primary page-control surface for humans and the assistant; changing it updates the whole page selection, including charts, KPIs, and the Portfolio Worklist.",
  "Use apply_workbench_controls whenever the user asks to show, filter, sort, prioritize, queue, focus the page on, or change the current Workbench using View / Queue, Client Segment, Priority, Risk Category, Due Status, Due Window, RM / Advisor, Sort by, or quick filter pills.",
  "Prefer this command-bar action over table/grid filters for ordinary requests such as 'show overdue', 'show this week', 'next 14 days', 'sort the page', 'largest outflow', 'high priority names', 'risk queue', 'only UHNW', 'R. Li', 'liquidity risks', 'due soon', or 'highest exposure'.",
  "Common mappings: risk queue -> workbenchViewQueue riskQueue; priority first -> workbenchViewQueue priorityFirst; due soon queue -> workbenchViewQueue dueSoon; due soon status -> dueStatus Due soon; today -> dueWindow today; this week -> dueWindow thisWeek; next week/next 7 days -> dueWindow next7; next two weeks/next 14 days -> dueWindow next14; this month -> dueWindow thisMonth; overdue -> dueStatus Overdue and/or quickFilters overdue; high priority -> priority High and/or quickFilters highPriority; largest outflow/outflows -> quickFilters largestOutflow and sortBy outflowAsc; biggest AUM -> sortBy aumDesc; due first -> sortBy dueAsc; risk exposure/highest exposure -> sortBy riskExposureDesc; priority due -> sortBy priorityDue.",
  "For apply_workbench_controls, set resourceId to advisoryWorkbenchControls, keep filters and sort empty, fill every command-bar field, keep unchanged dropdown controls as all/default, and use [] when no quick filter pill is active.",
  "Use clear_workbench_controls for requests like reset filters, clear controls, default view, or show everything.",
  "Use generic apply_grid_view only for precise column-level operations that the top command bar cannot express, such as highlighting exact row ids or a custom contains/between filter.",
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
      "Top command bar View / Queue control. Use riskQueue for the risk queue, priorityFirst for priority-first work, dueSoon for the due-soon queue, and default when unchanged or when another control carries the request.",
    ),
  clientSegment: z
    .string()
    .describe(
      "Top command bar Client Segment selected value. Use exact visible segment labels such as Corporate, UHNW, HNW, or Institutional. Use all when unchanged or when the user did not ask for a segment.",
    ),
  priority: z
    .enum(workbenchPriorityNames)
    .describe(
      "Top command bar Priority selected value. Use High for high-priority requests, Medium or Low only when explicitly requested, and all when unchanged.",
    ),
  riskCategory: z
    .enum(workbenchRiskCategoryNames)
    .describe(
      "Top command bar Risk Category selected value. Map liquidity, credit, margin, concentration, covenant, and collateral wording to the matching value. Use all when unchanged or when the risk wording is general rather than a category.",
    ),
  dueStatus: z
    .enum(workbenchDueStatusNames)
    .describe(
      "Top command bar Due Status selected value. Use Overdue, Due soon, Open, or No risk when the user asks for that status. Use all when unchanged. For 'overdue high priority', set both dueStatus Overdue and priority High.",
    ),
  dueWindow: z
    .enum(workbenchDueWindowNames)
    .describe(
      "Top command bar Due Window selected value. Use today for items due today, thisWeek for the current Monday-Sunday week, next7 for the next 7 days, next14 for the next 14 days, thisMonth for the current calendar month, and all when unchanged.",
    ),
  relationshipManager: z
    .string()
    .describe(
      "Top command bar RM / Advisor selected value, such as R. Li or H. Mueller. Use the exact advisor label from the current host context when possible; use all when unchanged.",
    ),
  sortBy: z
    .enum(workbenchSortNames)
    .describe(
      "Top command bar Sort by selected value. Use aumDesc for AUM high to low or biggest clients, dueAsc for earliest due date, outflowAsc for largest negative 30D flow, riskExposureDesc for highest risk exposure, and priorityDue for priority plus due date.",
    ),
  quickFilters: z
    .array(z.enum(workbenchQuickFilterNames))
    .describe(
      "Top command bar quick filter pills. Use largestOutflow, overdue, and/or highPriority when the user asks for those quick page filters. Combine with dropdown values when helpful; use [] when no pill should be active.",
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
  hostContext: HostContextSnapshot | undefined,
) => ({
  type: "grid.applyView" as const,
  resourceId,
  view: {
    filters: createWorkbenchControlFilters(input, hostContext),
    sort: createWorkbenchControlSort(input),
    highlightRowIds: input.highlightRowIds,
  },
});

const createHostCommand = (
  input: HostCommandToolInput,
  resourceId: string,
  resolveColumnId: ResolveHostColumnId,
  hostContext: HostContextSnapshot | undefined,
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
      return createApplyWorkbenchControlsCommand(input, resourceId, hostContext);
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

  const command = createHostCommand(input, resourceId, resolveColumnId, hostContext);

  return parseHostCommand(command);
};

const createWorkbenchControlFilters = (
  input: HostCommandToolInput,
  hostContext: HostContextSnapshot | undefined,
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
  const dueWindowFilter = createDueWindowFilter(input, hostContext);
  if (dueWindowFilter) filters.push(dueWindowFilter);
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

const createDueWindowFilter = (
  input: HostCommandToolInput,
  hostContext?: HostContextSnapshot,
): HostGridFilter | undefined => {
  const range = createDueWindowRange(input.dueWindow ?? "all", hostContext);
  if (!range) return undefined;
  return {
    columnId: "dueDate",
    operator: "between",
    value: range,
  };
};

const createDueWindowRange = (
  dueWindow: HostCommandToolInput["dueWindow"],
  hostContext?: HostContextSnapshot,
) => {
  if (dueWindow === "all") return undefined;
  const start = parseDateOnly(readHostAsOfDate(hostContext) ?? todayIsoDate());
  if (start === undefined) return undefined;

  if (dueWindow === "today") {
    return [formatIsoDate(start), formatIsoDate(start)];
  }
  if (dueWindow === "next7") {
    return [formatIsoDate(start), formatIsoDate(addDays(start, 7))];
  }
  if (dueWindow === "next14") {
    return [formatIsoDate(start), formatIsoDate(addDays(start, 14))];
  }
  if (dueWindow === "thisWeek") {
    return [formatIsoDate(startOfWeek(start)), formatIsoDate(endOfWeek(start))];
  }
  return [formatIsoDate(startOfMonth(start)), formatIsoDate(endOfMonth(start))];
};

const readHostAsOfDate = (hostContext: HostContextSnapshot | undefined) => {
  const metadata = hostContext?.metadata;
  const value = metadata?.asOfDate;
  return typeof value === "string" ? value : undefined;
};

const parseDateOnly = (value: string) => {
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
