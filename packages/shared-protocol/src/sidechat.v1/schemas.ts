import { z } from "zod";
import { SidechatProtocolVersion } from "./types.js";

export const RoleSchema = z.enum(["user", "assistant", "system"]);

export const ChatMessageSchema = z.object({
  id: z.string().min(1),
  role: RoleSchema,
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const CitationSourceSchema = z.object({
  sourceId: z.string().min(1),
  label: z.string().min(1),
  dataset: z.string().min(1),
  resourceId: z.string().min(1).optional(),
  rowId: z.string().min(1).optional(),
  field: z.string().min(1).optional(),
});

export const ModelSelectionSchema = z.object({
  provider: z.string().min(1),
  id: z.string().min(1),
  reasoningEffort: z
    .enum(["none", "minimal", "low", "medium", "high", "xhigh"])
    .optional(),
});

export const HostResourceColumnSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum([
    "text",
    "number",
    "date",
    "boolean",
    "currency",
    "percent",
    "custom",
  ]),
  description: z.string().optional(),
  sortable: z.boolean().optional(),
  filterable: z.boolean().optional(),
});

export const HostGridFilterSchema = z.object({
  columnId: z.string().min(1),
  operator: z.enum([
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
  ]),
  value: z.unknown().optional(),
});

export const HostGridSortSchema = z.object({
  columnId: z.string().min(1),
  direction: z.enum(["asc", "desc"]),
});

export const HostResourceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["grid", "table", "chart", "form", "page", "custom"]),
  label: z.string().min(1),
  description: z.string().optional(),
  rowCount: z.number().int().nonnegative().optional(),
  columns: z.array(HostResourceColumnSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const HostCapabilitySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  commandTypes: z.array(z.string().min(1)).optional(),
});

export const HostContextSnapshotSchema = z.object({
  pageId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().optional(),
  resources: z.array(HostResourceSchema).optional(),
  capabilities: z.array(HostCapabilitySchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const HostCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("grid.applyView"),
    resourceId: z.string().min(1),
    view: z.object({
      filters: z.array(HostGridFilterSchema).optional(),
      sort: z.array(HostGridSortSchema).optional(),
      highlightRowIds: z.array(z.string().min(1)).optional(),
    }),
  }),
  z.object({
    type: z.literal("grid.clearView"),
    resourceId: z.string().min(1),
  }),
  z.object({
    type: z.literal("ui.focusResource"),
    resourceId: z.string().min(1),
  }),
  z.object({
    type: z.literal("host.custom"),
    name: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).optional(),
  }),
]);

export const HostCommandResultSchema = z.object({
  status: z.enum(["applied", "rejected", "unsupported", "error"]),
  message: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const SidechatRequestSchema = z.object({
  workspaceId: z.string().min(1),
  conversationId: z.string().optional(),
  message: ChatMessageSchema,
  model: ModelSelectionSchema,
  hostContext: HostContextSnapshotSchema.optional(),
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

export const SidechatStreamHostCommandEventSchema = z.object({
  type: z.literal("sidechat.host_command"),
  requestId: z.string().min(1),
  messageId: z.string().min(1),
  commandId: z.string().min(1),
  command: HostCommandSchema,
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
  metadata: z.record(z.string(), z.unknown()).optional(),
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
  SidechatStreamHostCommandEventSchema,
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
  hostCommand: "sidechat.host_command",
  completed: "sidechat.completed",
  error: "sidechat.error",
  history: "sidechat.history",
} as const;
