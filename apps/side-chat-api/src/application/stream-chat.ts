import { Effect } from "effect";
import {
  type ModelSelection,
  type SidechatRequest,
  type SidechatStreamEvent,
} from "@side-chat/shared-protocol";
import type {
  AuthPort,
  BillingPort,
  ConfigPort,
  ConversationRepository,
  HostSurfaceStatePort,
  ModelPort,
  ObservabilityPort,
  PageContextPort,
  RateLimitPort,
  UsagePort,
  WorkbenchCitationSource,
  WorkbenchReportPort,
  WorkbenchToolsPort,
} from "#ports/index.js";
import {
  BillingDenied,
  ModelUnavailable,
  RateLimited,
  Unauthorized,
  UsageCaptureFailed,
} from "./errors.js";
import { decodeSidechatRequestEffect } from "./stream-chat-request-schema.js";
import {
  createDeltaEvent,
  createHostCommandEvent,
  createReasoningEvent,
  createStreamIndexes,
  createToolEvent,
} from "./stream-chat/events.js";
import {
  createAssistantMetadata,
  getToolAttachment,
  getToolCitationSources,
  type StreamAttachment,
} from "./stream-chat/metadata.js";
import { resolveSurfaceContexts } from "./stream-chat/surface-contexts.js";
import { enrichUsage } from "./stream-chat/usage.js";

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

export { selectInlineCitationSources } from "./stream-chat/metadata.js";

const hasConfiguredModel = (
  models: ModelSelection[],
  requested: ModelSelection,
) =>
  models.some(
    (model) =>
      model.provider === requested.provider && model.id === requested.id,
  );

const observeStreamEvent = (
  deps: StreamChatDeps,
  event: SidechatStreamEvent,
) => {
  deps.observability.lifecycle(event);
  return event;
};

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
