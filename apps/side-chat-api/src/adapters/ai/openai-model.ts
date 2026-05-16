import { openai } from "@ai-sdk/openai";
import { randomUUID } from "node:crypto";
import { stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import {
  parseHostCommand,
  validateHostCommand,
  type HostCommand,
  type HostContextSnapshot,
  type HostResource,
} from "@side-chat/shared-protocol";
import {
  workbenchReportFocusNames,
  workbenchReportNoteKinds,
  workbenchReportSectionNames,
  workbenchQueryNames,
  type ModelPort,
  type ModelRequest,
} from "#ports/index.js";
import type { TokenUsage } from "@side-chat/shared-protocol";
import { createModelInput } from "#application/prompt-context.js";

const asError = (error: unknown) => {
  if (error instanceof Error) return error;
  if (
    error &&
    typeof error === "object" &&
    "error" in error &&
    error.error instanceof Error
  ) {
    return error.error;
  }
  return new Error(
    typeof error === "string" ? error : "OpenAI stream failed",
  );
};

const toTokenUsage = (usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputTokenDetails?: {
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  outputTokenDetails?: {
    reasoningTokens?: number;
  };
  reasoningTokens?: number;
  cachedInputTokens?: number;
}): TokenUsage => ({
  inputTokens: usage.inputTokens ?? 0,
  outputTokens: usage.outputTokens ?? 0,
  totalTokens: usage.totalTokens ?? 0,
  reasoningTokens:
    usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens,
  cachedInputTokens:
    usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens,
  cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
});

const workbenchQueryInputSchema = z.object({
  query: z
    .enum(workbenchQueryNames)
    .describe(
      "Approved workbench data lookup. This is not SQL and does not accept arbitrary filters.",
    ),
});

const workbenchSurfaceContextInputSchema = z.object({
  resourceId: z
    .string()
    .min(1)
    .describe(
      "Current host resource id or label to inspect through trusted backend state.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .describe("Maximum number of visible rows to include. Use 12 by default."),
});

const workbenchReportInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(90)
    .describe("Short title to show at the top of the one-page report."),
  focus: z
    .enum(workbenchReportFocusNames)
    .describe("Primary report lens for the generated briefing."),
  sections: z
    .array(z.enum(workbenchReportSectionNames))
    .min(1)
    .max(5)
    .describe("Approved report sections to include. This is not arbitrary HTML."),
  noteKind: z
    .enum(workbenchReportNoteKinds)
    .describe(
      "Analyst note treatment: plain analyst note, risk rationale, next action, or custom user-requested wording.",
    ),
  note: z
    .string()
    .trim()
    .max(700)
    .describe(
      "Optional report-ready analyst note or user-requested custom wording. Keep it professional, do not include markdown, HTML, file paths, or internal tool/schema terms. Use an empty string when no note is needed.",
    ),
});

export const isCurrentSurfaceQuestion = (content: string) =>
  /\b(on (?:this )?page|page listed|listed on (?:this )?page|current view|visible|shown|showing|on screen|screen|table|present in the table|in the table|this list|listed|these rows|what i am seeing|you just filtered|you just sorted)\b/i.test(
    content,
  );

const dashboardCommandOutputSchema = z.object({
  commandId: z.string().min(1),
  command: z.unknown(),
  reason: z.string().optional(),
});

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

const parseHostFilterScalar = (value: string) => {
  const normalized = value.trim();
  if (/^(true|false)$/i.test(normalized)) return /^true$/i.test(normalized);
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  return normalized;
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

const createWorkbenchTools = (request: ModelRequest) => {
  if (!request.workbenchTools || !request.userId) return undefined;
  const currentSurfaceQuestion =
    isCurrentSurfaceQuestion(request.message.content) &&
    (Boolean(request.surfaceContexts?.length) ||
      Boolean(request.workbenchTools.surfaceContext));

  const tools = {
    ...(currentSurfaceQuestion
      ? {}
      : {
          workbench_query: tool({
            description:
              "Query approved UBS Partner Advisory Workbench data through backend stored-procedure access. Use for whole-dashboard facts, source rows, risk accounts, allocation, or trend data. Do not use this for 'on this page', currently visible, currently filtered, or just-sorted table questions; use workbench_surface_context for those. Never pass SQL.",
            inputSchema: workbenchQueryInputSchema,
            strict: true,
            execute: async (input) =>
              request.workbenchTools?.query({
                workspaceId: request.workspaceId,
                userId: request.userId!,
                conversationId: request.conversationId,
                pageContext: request.pageContext,
                query: input,
              }),
          }),
        }),
    ...(request.workbenchTools.surfaceContext
      ? {
          workbench_surface_context: tool({
            description:
              "Read the trusted backend-known current view for a host resource, including active filters, active sorts, visible row count, and a bounded visible row sample computed from approved backend data. Use this for any question phrased as 'on this page', 'current view', 'visible table', 'top row', 'what I am seeing', 'the table you just filtered/sorted', or 'which exact portfolio on this page'.",
            inputSchema: workbenchSurfaceContextInputSchema,
            strict: true,
            execute: async (input) =>
              request.workbenchTools?.surfaceContext?.({
                workspaceId: request.workspaceId,
                userId: request.userId!,
                conversationId: request.conversationId,
                pageContext: request.pageContext,
                resourceId: input.resourceId,
                limit: input.limit,
              }),
          }),
        }
      : {}),
    host_command: tool({
      description:
        "Request the active host surface to apply a visible UI action such as filtering a grid, sorting a grid, clearing a grid view, or focusing a resource. Use this when the user asks to show, filter, sort, focus, find, or surface dashboard rows. Return only validated host commands from the provided host context.",
      inputSchema: hostCommandInputSchema,
      strict: true,
      execute: async (input) => ({
        commandId: randomUUID(),
        command: toHostCommand(input, request.hostContext),
        reason: input.reason,
      }),
    }),
  };

  if (!request.workbenchReports) return tools;

  return {
    ...tools,
    generate_workbench_report: tool({
      description:
        "Generate a one-page UBS Partner Advisory Workbench PDF report from approved backend workbench data. Inputs control title, focus, sections, analyst note treatment, and report-ready note text only; HTML and file paths are not accepted.",
      inputSchema: workbenchReportInputSchema,
      strict: true,
      execute: async (input) =>
        request.workbenchReports?.generate({
          workspaceId: request.workspaceId,
          userId: request.userId!,
          pageContext: request.pageContext,
          report: input,
          workbenchTools: request.workbenchTools!,
        }),
    }),
  };
};

export const openAiModelAdapter: ModelPort = {
  async *stream(request, signal) {
    let streamError: unknown;
    const modelInput = createModelInput(request);
    const result = streamText({
      model: openai(request.model.id),
      system: modelInput.system,
      prompt: modelInput.prompt,
      tools: createWorkbenchTools(request),
      stopWhen: stepCountIs(3),
      abortSignal: signal,
      providerOptions: {
        openai: {
          reasoningEffort: request.model.reasoningEffort ?? "low",
          reasoningSummary: "auto",
        },
      },
      onError(event) {
        streamError = event.error;
      },
    });
    let doneSeen = false;
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        yield { kind: "delta", text: part.text };
        continue;
      }
      if (part.type === "reasoning-delta") {
        yield { kind: "reasoning", text: part.text };
        continue;
      }
      if (part.type === "tool-call") {
        if (part.toolName === "host_command") continue;
        yield {
          kind: "tool",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          status: "running",
          input: part.input,
        };
        continue;
      }
      if (part.type === "tool-result") {
        if (part.toolName === "host_command") {
          const parsed = dashboardCommandOutputSchema.safeParse(part.output);
          const command = parsed.success
            ? validateHostCommand(parsed.data.command)
            : undefined;
          if (parsed.success && command?.ok) {
            yield {
              kind: "host-command",
              commandId: parsed.data.commandId,
              command: command.data,
            };
          }
          continue;
        }
        yield {
          kind: "tool",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          status: "completed",
          input: part.input,
          output: part.output,
        };
        continue;
      }
      if (part.type === "tool-error") {
        yield {
          kind: "tool",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          status: "error",
          input: part.input,
          error: part.error instanceof Error ? part.error.message : String(part.error),
        };
        continue;
      }
      if (part.type === "error") {
        throw asError(part.error);
      }
      if (part.type === "finish") {
        doneSeen = true;
        yield {
          kind: "done",
          finishReason: part.finishReason,
          usage: toTokenUsage(part.totalUsage),
        };
      }
    }
    if (streamError) throw asError(streamError);
    if (!doneSeen) {
      const usage = await result.usage;
      yield {
        kind: "done",
        finishReason: "stop",
        usage: toTokenUsage(usage),
      };
    }
  },
};
