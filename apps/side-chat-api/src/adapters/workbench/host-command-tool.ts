import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  parseHostCommand,
  validateHostCommand,
  type HostCommand,
  type HostContextSnapshot,
  type HostResource,
} from "@side-chat/shared-protocol";

/**
 * Model-facing host command adapter. This module owns the translation from a
 * small, LLM-friendly tool schema into the real sidechat.v1 host command
 * protocol. Provider adapters may expose this schema, but they should not know
 * grid/filter/sort semantics themselves.
 */
const hostCommandActionNames = [
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

export const hostCommandToolDescription =
  "Request the active host surface to apply a visible UI action such as filtering a grid, sorting a grid, clearing a grid view, or focusing a resource. Use this when the user asks to show, filter, sort, focus, find, or surface dashboard rows. Return only validated host commands from the provided host context.";

export const hostCommandInputSchema = z.object({
  action: z
    .enum(hostCommandActionNames)
    .describe(
      "UI action to request: apply a grid view, clear a grid view, or focus a visible resource.",
    ),
  resourceId: z
    .string()
    .min(1)
    .describe("The resource id from the provided host context."),
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
    .describe("Grid filters to apply. Use [] when no filters are needed."),
  sort: z
    .array(
      z.object({
        columnId: z.string().min(1),
        direction: z.enum(["asc", "desc"]),
      }),
    )
    .describe("Grid sort rules to apply. Use [] when no sorting is needed."),
  highlightRowIds: z
    .array(z.string().min(1))
    .describe("Row ids to highlight. Use [] when no row highlight is needed."),
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

const createHostCommand = (
  input: HostCommandToolInput,
  resourceId: string,
  resolveColumnId: ResolveHostColumnId,
) => {
  switch (input.action) {
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
  }
};

export const toHostCommand = (
  input: HostCommandToolInput,
  hostContext?: HostContextSnapshot,
): HostCommand => {
  const resource = findHostResource(hostContext, input.resourceId);
  const resourceId = resource?.id ?? input.resourceId;

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
