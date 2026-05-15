import { z } from "zod";
import { SidechatProtocolVersion } from "./types.js";

export const RoleSchema = z.enum(["user", "assistant", "system"]);

export const ChatMessageSchema = z.object({
  id: z.string().min(1),
  role: RoleSchema,
  content: z.string().min(1),
});

export const ModelSelectionSchema = z.object({
  provider: z.string().min(1),
  id: z.string().min(1),
  reasoningEffort: z
    .enum(["none", "minimal", "low", "medium", "high", "xhigh"])
    .optional(),
});

export const SidechatRequestSchema = z.object({
  workspaceId: z.string().min(1),
  conversationId: z.string().optional(),
  message: ChatMessageSchema,
  model: ModelSelectionSchema,
});

export const SidechatStreamStartEventSchema = z.object({
  type: z.literal("sidechat.started"),
  requestId: z.string().min(1),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  model: ModelSelectionSchema,
});

export const SidechatStreamDeltaEventSchema = z.object({
  type: z.literal("sidechat.delta"),
  requestId: z.string().min(1),
  messageId: z.string().min(1),
  content: z.string(),
  index: z.number().int().nonnegative(),
});

export const SidechatStreamReasoningEventSchema = z.object({
  type: z.literal("sidechat.reasoning"),
  requestId: z.string().min(1),
  messageId: z.string().min(1),
  content: z.string(),
  index: z.number().int().nonnegative(),
});

export const SidechatStreamToolEventSchema = z.object({
  type: z.literal("sidechat.tool"),
  requestId: z.string().min(1),
  messageId: z.string().min(1),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  status: z.enum(["running", "completed", "error"]),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  index: z.number().int().nonnegative(),
});

export const SidechatTokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
  estimatedCostUsd: z.number().nonnegative().optional(),
});

export const SidechatStreamCompletedEventSchema = z.object({
  type: z.literal("sidechat.completed"),
  requestId: z.string().min(1),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  model: ModelSelectionSchema,
  finishReason: z.string().min(1),
  usage: SidechatTokenUsageSchema,
});

export const SidechatStreamErrorEventSchema = z.object({
  type: z.literal("sidechat.error"),
  requestId: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
});

export const SidechatStreamHistoryEventSchema = z.object({
  type: z.literal("sidechat.history"),
  requestId: z.string().min(1),
  conversationId: z.string().min(1),
  messages: z.array(ChatMessageSchema),
});

export const SidechatStreamEventSchema = z.discriminatedUnion("type", [
  SidechatStreamStartEventSchema,
  SidechatStreamDeltaEventSchema,
  SidechatStreamReasoningEventSchema,
  SidechatStreamToolEventSchema,
  SidechatStreamCompletedEventSchema,
  SidechatStreamErrorEventSchema,
  SidechatStreamHistoryEventSchema,
]);

export const SidechatHeadersSchema = z.object({
  "Content-Type": z.literal("application/json").optional(),
  Accept: z.literal("text/event-stream").optional(),
  "X-Sidechat-Protocol": z.literal(SidechatProtocolVersion),
  "X-Request-Id": z.string().optional(),
});

export const protocolArtifacts = {
  protocol: SidechatProtocolVersion,
  start: "sidechat.started",
  delta: "sidechat.delta",
  reasoning: "sidechat.reasoning",
  tool: "sidechat.tool",
  completed: "sidechat.completed",
  error: "sidechat.error",
  history: "sidechat.history",
} as const;
