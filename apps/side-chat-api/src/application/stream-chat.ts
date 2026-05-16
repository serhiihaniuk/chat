import { Effect } from "effect";
import {
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
  ModelChunk,
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
} from "#ports/index.js";
import {
  BillingDenied,
  ModelUnavailable,
  RateLimited,
  Unauthorized,
  UsageCaptureFailed,
} from "./errors.js";
import { decodeSidechatRequestEffect } from "./stream-chat-request-schema.js";

/**
 * Main backend use case. It is intentionally framework-free: it accepts ports,
 * validates a sidechat.v1 request, orchestrates auth/context/model/tool work,
 * and yields sidechat.v1 stream events for an inbound adapter to serialize.
 */
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
const maxSurfaceContextResources = 4;

const shouldResolveSurfaceResource = (kind: string) =>
  kind === "grid" || kind === "table" || kind === "custom";

const isSurfaceCitationSource = (source: WorkbenchCitationSource) =>
  Boolean(source.resourceId);

export const selectInlineCitationSources = (
  assistantContent: string,
  sources: WorkbenchCitationSource[],
): WorkbenchCitationSource[] => {
  const uniqueSources = Array.from(
    new Map(sources.map((source) => [source.sourceId, source])).values(),
  );

  const normalizedContent = normalizeCitationText(assistantContent);
  const matchedSources = uniqueSources.filter((source) =>
    getSourceSearchTerms(source).some((term) => normalizedContent.includes(term)),
  );
  if (matchedSources.length > 0) {
    return matchedSources.slice(0, maxMatchedCitationSources);
  }

  return uniqueSources
    .filter((source) => !isSurfaceCitationSource(source))
    .slice(0, 1);
};

type StreamAttachment = {
  id: string;
  name: string;
  url: string;
  mediaType: string;
};

type StreamIndexes = {
  delta: number;
  reasoning: number;
  tool: number;
  hostCommand: number;
};

const createStreamIndexes = (): StreamIndexes => ({
  delta: 0,
  reasoning: 0,
  tool: 0,
  hostCommand: 0,
});

const hasConfiguredModel = (
  models: ModelSelection[],
  requested: ModelSelection,
) =>
  models.some(
    (model) =>
      model.provider === requested.provider && model.id === requested.id,
  );

const resolveSurfaceContexts = async (
  deps: StreamChatDeps,
  request: SidechatRequest,
  userId: string,
  conversationId: string,
  pageContext: Awaited<ReturnType<PageContextPort["resolve"]>>,
) => {
  const workbenchTools = deps.workbenchTools;
  if (!workbenchTools?.surfaceContext) return undefined;

  const resources = (request.hostContext?.resources ?? [])
    .filter((resource) => shouldResolveSurfaceResource(resource.kind))
    .slice(0, maxSurfaceContextResources);

  return Promise.all(
    resources.map((resource) =>
      workbenchTools.surfaceContext!({
        workspaceId: request.workspaceId,
        userId,
        conversationId,
        pageContext,
        resourceId: resource.id,
        limit: surfaceContextLimit,
      }),
    ),
  );
};

/**
 * Final assistant metadata is deliberately selected by the use case, not the
 * provider adapter, so persistence and protocol metadata stay product-owned.
 */
const createAssistantMetadata = (
  assistantContent: string,
  citationSources: WorkbenchCitationSource[],
  attachments: StreamAttachment[],
): Record<string, unknown> | undefined => {
  const selectedCitationSources = selectInlineCitationSources(
    assistantContent,
    citationSources,
  );
  const metadata: Record<string, unknown> = {};

  if (selectedCitationSources.length > 0) {
    metadata.citations = selectedCitationSources;
  }

  if (attachments.length > 0) {
    metadata.attachments = attachments;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const observeStreamEvent = (
  deps: StreamChatDeps,
  event: SidechatStreamEvent,
) => {
  deps.observability.lifecycle(event);
  return event;
};

const createDeltaEvent = (
  requestId: string,
  assistantMessageId: string,
  chunk: Extract<ModelChunk, { kind: "delta" }>,
  indexes: StreamIndexes,
): SidechatStreamEvent => ({
  type: "sidechat.delta",
  requestId,
  messageId: assistantMessageId,
  content: chunk.text,
  index: indexes.delta++,
});

const createReasoningEvent = (
  requestId: string,
  assistantMessageId: string,
  chunk: Extract<ModelChunk, { kind: "reasoning" }>,
  indexes: StreamIndexes,
): SidechatStreamEvent => ({
  type: "sidechat.reasoning",
  requestId,
  messageId: assistantMessageId,
  content: chunk.text,
  index: indexes.reasoning++,
});

const createToolEvent = (
  requestId: string,
  assistantMessageId: string,
  chunk: Extract<ModelChunk, { kind: "tool" }>,
  indexes: StreamIndexes,
): SidechatStreamEvent => ({
  type: "sidechat.tool",
  requestId,
  messageId: assistantMessageId,
  toolCallId: chunk.toolCallId,
  toolName: chunk.toolName,
  status: chunk.status,
  input: chunk.input,
  output: chunk.output,
  error: chunk.error,
  index: indexes.tool++,
});

const createHostCommandEvent = (
  requestId: string,
  assistantMessageId: string,
  chunk: Extract<ModelChunk, { kind: "host-command" }>,
  indexes: StreamIndexes,
): SidechatStreamEvent => ({
  type: "sidechat.host_command",
  requestId,
  messageId: assistantMessageId,
  commandId: chunk.commandId,
  command: chunk.command,
  index: indexes.hostCommand++,
});

export const streamChatEffect = (
  deps: StreamChatDeps,
  input: StreamChatInput,
) =>
  Effect.map(decodeSidechatRequestEffect(input.body), (request) =>
    streamChatWithRequest(deps, input, request),
  );

/**
 * Framework-free use case entry point. It is an async generator so callers can
 * consume product events without knowing whether transport is HTTP, tests, etc.
 */
export async function* streamChat(
  deps: StreamChatDeps,
  input: StreamChatInput,
): AsyncIterable<SidechatStreamEvent> {
  const request = await Effect.runPromise(
    decodeSidechatRequestEffect(input.body),
  );

  yield* streamChatWithRequest(deps, input, request);
}

async function* streamChatWithRequest(
  deps: StreamChatDeps,
  input: StreamChatInput,
  request: SidechatRequest,
): AsyncIterable<SidechatStreamEvent> {
  const userId = deps.config.defaultUserId();
  if (!hasConfiguredModel(deps.config.models(), request.model)) {
    throw new ModelUnavailable(request.model.id);
  }
  if (!(await deps.auth.authorize(request.workspaceId, userId))) {
    throw new Unauthorized();
  }
  if (!(await deps.rateLimit.check(request.workspaceId, userId))) {
    throw new RateLimited();
  }
  if (!(await deps.billing.allow(request.workspaceId))) {
    throw new BillingDenied();
  }

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
  const surfaceContexts = await resolveSurfaceContexts(
    deps,
    request,
    userId,
    conversationId,
    pageContext,
  );
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
  deps.observability.counter("sidechat.stream.started", {
    model: request.model.id,
  });
  yield observeStreamEvent(deps, started);

  let assistantContent = "";
  const indexes = createStreamIndexes();
  const citationSources: WorkbenchCitationSource[] =
    surfaceContexts?.flatMap((context) => context.sources) ?? [];
  const attachments: StreamAttachment[] = [];
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
      yield observeStreamEvent(
        deps,
        createDeltaEvent(input.requestId, assistantMessageId, chunk, indexes),
      );
      continue;
    }

    if (chunk.kind === "reasoning") {
      yield observeStreamEvent(
        deps,
        createReasoningEvent(input.requestId, assistantMessageId, chunk, indexes),
      );
      continue;
    }

    if (chunk.kind === "tool") {
      if (chunk.status === "completed") {
        citationSources.push(...getToolCitationSources(chunk.output));
        const attachment = getToolAttachment(chunk);
        if (attachment) attachments.push(attachment);
      }

      yield observeStreamEvent(
        deps,
        createToolEvent(input.requestId, assistantMessageId, chunk, indexes),
      );
      continue;
    }

    if (chunk.kind === "host-command") {
      await deps.hostSurfaceState?.applyCommand({
        workspaceId: request.workspaceId,
        userId,
        conversationId,
        command: chunk.command,
      });
      yield observeStreamEvent(
        deps,
        createHostCommandEvent(
          input.requestId,
          assistantMessageId,
          chunk,
          indexes,
        ),
      );
      continue;
    }

    const usage = enrichUsage(request.model, chunk.usage);
    const metadata = createAssistantMetadata(
      assistantContent,
      citationSources,
      attachments,
    );

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
    deps.observability.counter("sidechat.stream.completed", {
      model: request.model.id,
    });
    yield observeStreamEvent(deps, completed);
    return;
  }
}
