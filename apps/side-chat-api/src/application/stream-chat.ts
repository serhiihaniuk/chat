import { Effect } from "effect";
import {
  SidechatRequestSchema,
  type SidechatStreamEvent,
  type SidechatRequest,
  type ModelSelection,
  type TokenUsage,
} from "@side-chat/shared-protocol";
import type {
  AuthPort,
  BillingPort,
  ConfigPort,
  ConversationRepository,
  ModelPort,
  ObservabilityPort,
  PageContextPort,
  RateLimitPort,
  UsagePort,
  WorkbenchCitationSource,
  WorkbenchReportPort,
  WorkbenchReportResult,
  WorkbenchToolsPort,
  HostSurfaceStatePort,
} from "../ports/index.js";
import {
  BillingDenied,
  ModelUnavailable,
  RateLimited,
  Unauthorized,
  UsageCaptureFailed,
} from "./errors.js";

export type StreamChatDeps = {
  model: ModelPort;
  pageContext: PageContextPort;
  workbenchTools?: WorkbenchToolsPort;
  workbenchReports?: WorkbenchReportPort;
  hostSurfaceState?: HostSurfaceStatePort;
  conversations: ConversationRepository;
  usage: UsagePort;
  auth: AuthPort;
  rateLimit: RateLimitPort;
  billing: BillingPort;
  observability: ObservabilityPort;
  config: ConfigPort;
};
export type StreamChatInput = {
  requestId: string;
  body: unknown;
  signal?: AbortSignal;
};

const modelPricingPerMillion: Record<
  string,
  { inputUsd: number; outputUsd: number; cachedInputUsd?: number }
> = {
  "gpt-5.4-nano": { inputUsd: 0.05, outputUsd: 0.2, cachedInputUsd: 0.005 },
};

const enrichUsage = (model: ModelSelection, usage: TokenUsage): TokenUsage => {
  const pricing = modelPricingPerMillion[model.id];
  if (!pricing || usage.estimatedCostUsd !== undefined) return usage;

  const cachedInputTokens = usage.cachedInputTokens ?? 0;
  const billableInputTokens = Math.max(0, usage.inputTokens - cachedInputTokens);
  const cachedInputCost =
    (cachedInputTokens / 1_000_000) *
    (pricing.cachedInputUsd ?? pricing.inputUsd);
  const inputCost = (billableInputTokens / 1_000_000) * pricing.inputUsd;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputUsd;

  return {
    ...usage,
    estimatedCostUsd: Number(
      (inputCost + cachedInputCost + outputCost).toFixed(6),
    ),
  };
};

const isWorkbenchCitationSource = (
  value: unknown,
): value is WorkbenchCitationSource => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const source = value as Record<string, unknown>;
  return (
    typeof source.sourceId === "string" &&
    typeof source.label === "string" &&
    typeof source.dataset === "string" &&
    (source.resourceId === undefined || typeof source.resourceId === "string") &&
    (source.rowId === undefined || typeof source.rowId === "string") &&
    (source.field === undefined || typeof source.field === "string")
  );
};

const getToolCitationSources = (output: unknown): WorkbenchCitationSource[] => {
  if (!output || typeof output !== "object" || Array.isArray(output)) return [];

  const sources = (output as { sources?: unknown }).sources;
  return Array.isArray(sources) ? sources.filter(isWorkbenchCitationSource) : [];
};

const isWorkbenchReportResult = (
  value: unknown,
): value is WorkbenchReportResult => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const report = value as Record<string, unknown>;
  return (
    typeof report.reportId === "string" &&
    typeof report.reportUrl === "string" &&
    typeof report.title === "string" &&
    (report.fileName === undefined || typeof report.fileName === "string")
  );
};

const getToolAttachment = (chunk: {
  toolCallId: string;
  toolName: string;
  output?: unknown;
}) => {
  if (
    chunk.toolName !== "generate_workbench_report" ||
    !isWorkbenchReportResult(chunk.output)
  ) {
    return undefined;
  }

  return {
    id: chunk.toolCallId,
    name: `${chunk.output.title}.pdf`,
    url: chunk.output.reportUrl,
    mediaType: "application/pdf",
  };
};

const normalizeCitationText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getSourceSearchTerms = (source: WorkbenchCitationSource) => {
  const labelTail = source.label.split("·").at(-1)?.trim();
  return [labelTail, source.rowId, source.field]
    .filter((term): term is string => Boolean(term && term.length > 2))
    .map(normalizeCitationText);
};

const maxMatchedCitationSources = 2;

const surfaceContextLimit = 12;

const shouldResolveSurfaceResource = (kind: string) =>
  kind === "grid" || kind === "table" || kind === "custom";

export const selectInlineCitationSources = (
  assistantContent: string,
  sources: WorkbenchCitationSource[],
): WorkbenchCitationSource[] => {
  const uniqueSources = Array.from(
    new Map(sources.map((source) => [source.sourceId, source])).values(),
  );
  if (uniqueSources.length <= 1) return uniqueSources;

  const normalizedContent = normalizeCitationText(assistantContent);
  const matchedSources = uniqueSources.filter((source) =>
    getSourceSearchTerms(source).some((term) => normalizedContent.includes(term)),
  );

  return matchedSources.length > 0
    ? matchedSources.slice(0, maxMatchedCitationSources)
    : uniqueSources.slice(0, 1);
};

export const streamChatEffect = (
  deps: StreamChatDeps,
  input: StreamChatInput,
) => Effect.succeed(streamChat(deps, input));

export async function* streamChat(
  deps: StreamChatDeps,
  input: StreamChatInput,
): AsyncIterable<SidechatStreamEvent> {
  const request = SidechatRequestSchema.parse(
    input.body,
  ) satisfies SidechatRequest;
  const userId = deps.config.defaultUserId();
  if (
    !deps.config
      .models()
      .some(
        (model) =>
          model.provider === request.model.provider &&
          model.id === request.model.id,
      )
  )
    throw new ModelUnavailable(request.model.id);
  if (!(await deps.auth.authorize(request.workspaceId, userId)))
    throw new Unauthorized();
  if (!(await deps.rateLimit.check(request.workspaceId, userId)))
    throw new RateLimited();
  if (!(await deps.billing.allow(request.workspaceId)))
    throw new BillingDenied();

  const conversationId = await deps.conversations.createOrGet({
    workspaceId: request.workspaceId,
    userId,
    conversationId: request.conversationId,
  });
  const pageContext = await deps.pageContext?.resolve({
    workspaceId: request.workspaceId,
    userId,
    conversationId,
  });
  const recentMessages = await deps.conversations.readSeededHistory(
    request.workspaceId,
    conversationId,
  );
  const surfaceContexts = deps.workbenchTools?.surfaceContext
    ? await Promise.all(
        (request.hostContext?.resources ?? [])
          .filter((resource) => shouldResolveSurfaceResource(resource.kind))
          .slice(0, 4)
          .map((resource) =>
            deps.workbenchTools!.surfaceContext!({
              workspaceId: request.workspaceId,
              userId,
              conversationId,
              pageContext,
              resourceId: resource.id,
              limit: surfaceContextLimit,
            }),
          ),
      )
    : undefined;
  await deps.conversations.appendUserMessage(
    conversationId,
    request.message.id,
    request.message.content,
  );
  const assistantMessageId = `${input.requestId}-assistant`;
  const started: SidechatStreamEvent = {
    type: "sidechat.started",
    conversationId,
    messageId: assistantMessageId,
    requestId: input.requestId,
    model: request.model,
  };
  deps.observability.lifecycle(started);
  deps.observability.counter("sidechat.stream.started", {
    model: request.model.id,
  });
  yield started;

  let assistantContent = "";
  let index = 0;
  let reasoningIndex = 0;
  let toolIndex = 0;
  let hostCommandIndex = 0;
  const citationSources: WorkbenchCitationSource[] =
    surfaceContexts?.flatMap((context) => context.sources) ?? [];
  const attachments: Array<{
    id: string;
    name: string;
    url: string;
    mediaType: string;
  }> = [];
  const modelRequest = {
    ...request,
    conversationId,
    pageContext,
    surfaceContexts,
    recentMessages,
    userId,
    workbenchTools: deps.workbenchTools,
    workbenchReports: deps.workbenchReports,
  };

  for await (const chunk of deps.model.stream(modelRequest, input.signal)) {
    if (chunk.kind === "delta") {
      assistantContent += chunk.text;
      const event: SidechatStreamEvent = {
        type: "sidechat.delta",
        requestId: input.requestId,
        messageId: assistantMessageId,
        content: chunk.text,
        index,
      };
      index += 1;
      deps.observability.lifecycle(event);
      yield event;
      continue;
    }

    if (chunk.kind === "reasoning") {
      const event: SidechatStreamEvent = {
        type: "sidechat.reasoning",
        requestId: input.requestId,
        messageId: assistantMessageId,
        content: chunk.text,
        index: reasoningIndex,
      };
      reasoningIndex += 1;
      deps.observability.lifecycle(event);
      yield event;
      continue;
    }

    if (chunk.kind === "tool") {
      if (chunk.status === "completed") {
        citationSources.push(...getToolCitationSources(chunk.output));
        const attachment = getToolAttachment(chunk);
        if (attachment) attachments.push(attachment);
      }

      const event: SidechatStreamEvent = {
        type: "sidechat.tool",
        requestId: input.requestId,
        messageId: assistantMessageId,
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        status: chunk.status,
        input: chunk.input,
        output: chunk.output,
        error: chunk.error,
        index: toolIndex,
      };
      toolIndex += 1;
      deps.observability.lifecycle(event);
      yield event;
      continue;
    }

    if (chunk.kind === "host-command") {
      await deps.hostSurfaceState?.applyCommand({
        workspaceId: request.workspaceId,
        userId,
        conversationId,
        command: chunk.command,
      });
      const event: SidechatStreamEvent = {
        type: "sidechat.host_command",
        requestId: input.requestId,
        messageId: assistantMessageId,
        commandId: chunk.commandId,
        command: chunk.command,
        index: hostCommandIndex,
      };
      hostCommandIndex += 1;
      deps.observability.lifecycle(event);
      yield event;
      continue;
    }

    const usage = enrichUsage(request.model, chunk.usage);
    const selectedCitationSources = selectInlineCitationSources(
      assistantContent,
      citationSources,
    );
    const metadata =
      selectedCitationSources.length > 0 || attachments.length > 0
        ? {
            ...(selectedCitationSources.length > 0
              ? { citations: selectedCitationSources }
              : {}),
            ...(attachments.length > 0 ? { attachments } : {}),
          }
        : undefined;

    await deps.conversations.appendAssistantMessage(
      conversationId,
      assistantMessageId,
      assistantContent,
      request.model,
      metadata,
    );
    try {
      await deps.usage.record({
        requestId: input.requestId,
        conversationId,
        messageId: assistantMessageId,
        model: request.model,
        usage,
      });
    } catch {
      throw new UsageCaptureFailed();
    }
    const completed: SidechatStreamEvent = {
      type: "sidechat.completed",
      requestId: input.requestId,
      conversationId,
      messageId: assistantMessageId,
      model: request.model,
      finishReason: chunk.finishReason,
      usage,
      metadata,
    };
    deps.observability.lifecycle(completed);
    deps.observability.counter("sidechat.stream.completed", {
      model: request.model.id,
    });
    yield completed;
  }
}
