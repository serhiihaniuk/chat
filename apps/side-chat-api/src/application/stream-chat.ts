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
  WorkbenchReportPort,
  WorkbenchToolsPort,
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
  const modelRequest = {
    ...request,
    pageContext,
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

    const usage = enrichUsage(request.model, chunk.usage);

    await deps.conversations.appendAssistantMessage(
      conversationId,
      assistantMessageId,
      assistantContent,
      request.model,
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
    };
    deps.observability.lifecycle(completed);
    deps.observability.counter("sidechat.stream.completed", {
      model: request.model.id,
    });
    yield completed;
  }
}
