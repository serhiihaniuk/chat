import { openai } from "@ai-sdk/openai";
import { stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
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
import {
  createHostCommandToolOutput,
  hostCommandInputSchema,
  hostCommandToolDescription,
  parseHostCommandToolOutput,
} from "#adapters/workbench/host-command-tool.js";
import { isUnknownRecord } from "../../shared/unknown-record.js";

/**
 * AI SDK/OpenAI adapter. It is the only place that should understand provider
 * stream parts; the rest of the backend consumes normalized ModelChunk values.
 */
const asError = (error: unknown) => {
  if (error instanceof Error) return error;
  if (isUnknownRecord(error) && error.error instanceof Error) {
    return error.error;
  }
  if (typeof error === "string") return new Error(error);
  return new Error("OpenAI stream failed");
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

/**
 * Creates AI SDK tools from backend ports. This is the adapter-only place where
 * Zod tool schemas are needed; sidechat.v1 remains Effect Schema-owned.
 */
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
      description: hostCommandToolDescription,
      inputSchema: hostCommandInputSchema,
      strict: true,
      execute: async (input) =>
        createHostCommandToolOutput(input, request.hostContext),
    }),
  };

  if (!request.workbenchReports) return tools;

  return {
    ...tools,
    generate_workbench_report: tool({
      description:
        "Generate a one-page UBS Partner Advisory Workbench PDF report from approved backend workbench data. For specific requests like top risk portfolios or allocation reports, gather the relevant workbench data first, then call this with a matching title, focus, sections, and data-derived analyst note. Inputs control title, focus, sections, analyst note treatment, and report-ready note text only; HTML and file paths are not accepted.",
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
  /**
   * Translate AI SDK stream parts into provider-neutral ModelChunk values. The
   * application layer turns those chunks into sidechat.v1 events.
   */
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
          const output = parseHostCommandToolOutput(part.output);
          if (output) {
            yield {
              kind: "host-command",
              commandId: output.commandId,
              command: output.command,
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
