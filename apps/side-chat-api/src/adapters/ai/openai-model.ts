import { openai } from "@ai-sdk/openai";
import { stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import {
  workbenchReportFocusNames,
  workbenchReportSectionNames,
  workbenchQueryNames,
  type ModelPort,
  type ModelRequest,
} from "../../ports/index.js";
import type { TokenUsage } from "@side-chat/shared-protocol";
import { createModelInput } from "../../application/prompt-context.js";

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
  note: z
    .string()
    .trim()
    .max(220)
    .describe("Optional short analyst note. Use an empty string when no note is needed."),
});

const createWorkbenchTools = (request: ModelRequest) => {
  if (!request.workbenchTools || !request.userId) return undefined;

  const tools = {
    workbench_query: tool({
      description:
        "Query approved UBS Partner Advisory Workbench data through backend stored-procedure access. Use only for exact dashboard facts, rows, risk accounts, allocation, or trend data. Never pass SQL.",
      inputSchema: workbenchQueryInputSchema,
      strict: true,
      execute: async (input) =>
        request.workbenchTools?.query({
          workspaceId: request.workspaceId,
          userId: request.userId!,
          pageContext: request.pageContext,
          query: input,
        }),
    }),
  };

  if (!request.workbenchReports) return tools;

  return {
    ...tools,
    generate_workbench_report: tool({
      description:
        "Generate a one-page UBS Partner Advisory Workbench PDF report from approved backend workbench data. Inputs control title, focus, sections, and a short note only; HTML and file paths are not accepted.",
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
