import { Schema } from "effect";

/**
 * Effect Schema is the canonical sidechat.v1 source of truth: it gives us
 * TypeScript types, runtime decoding, and future adapter outputs without
 * maintaining a parallel Zod or JSON Schema contract by hand.
 */
export const NonEmptyStringSchema = Schema.String.check(
  Schema.isMinLength(1),
);

export const MetadataSchema = Schema.Record(Schema.String, Schema.Unknown);

export const RoleSchema = Schema.Literals(["user", "assistant", "system"]);

export const ChatMessageSchema = Schema.Struct({
  id: NonEmptyStringSchema,
  role: RoleSchema,
  content: NonEmptyStringSchema,
  metadata: Schema.optionalKey(MetadataSchema),
});

export const CitationSourceSchema = Schema.Struct({
  sourceId: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  dataset: NonEmptyStringSchema,
  resourceId: Schema.optionalKey(NonEmptyStringSchema),
  rowId: Schema.optionalKey(NonEmptyStringSchema),
  field: Schema.optionalKey(NonEmptyStringSchema),
});

export const ReasoningEffortSchema = Schema.Literals([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

export const ModelSelectionSchema = Schema.Struct({
  provider: NonEmptyStringSchema,
  id: NonEmptyStringSchema,
  reasoningEffort: Schema.optionalKey(ReasoningEffortSchema),
});

export const HostResourceColumnTypeSchema = Schema.Literals([
  "text",
  "number",
  "date",
  "boolean",
  "currency",
  "percent",
  "custom",
]);

export const HostResourceColumnSchema = Schema.Struct({
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  type: HostResourceColumnTypeSchema,
  description: Schema.optionalKey(Schema.String),
  sortable: Schema.optionalKey(Schema.Boolean),
  filterable: Schema.optionalKey(Schema.Boolean),
});

export const HostGridFilterOperatorSchema = Schema.Literals([
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
]);

export const HostGridFilterSchema = Schema.Struct({
  columnId: NonEmptyStringSchema,
  operator: HostGridFilterOperatorSchema,
  value: Schema.optionalKey(Schema.Unknown),
});

export const HostGridSortSchema = Schema.Struct({
  columnId: NonEmptyStringSchema,
  direction: Schema.Literals(["asc", "desc"]),
});

export const HostResourceKindSchema = Schema.Literals([
  "grid",
  "table",
  "chart",
  "form",
  "page",
  "custom",
]);

export const HostResourceSchema = Schema.Struct({
  id: NonEmptyStringSchema,
  kind: HostResourceKindSchema,
  label: NonEmptyStringSchema,
  description: Schema.optionalKey(Schema.String),
  rowCount: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  ),
  columns: Schema.optionalKey(Schema.mutable(Schema.Array(HostResourceColumnSchema))),
  metadata: Schema.optionalKey(MetadataSchema),
});

export const HostCapabilitySchema = Schema.Struct({
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  description: Schema.optionalKey(Schema.String),
  commandTypes: Schema.optionalKey(
    Schema.mutable(Schema.Array(NonEmptyStringSchema)),
  ),
});

export const HostContextSnapshotSchema = Schema.Struct({
  pageId: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  summary: Schema.optionalKey(Schema.String),
  resources: Schema.optionalKey(Schema.mutable(Schema.Array(HostResourceSchema))),
  capabilities: Schema.optionalKey(
    Schema.mutable(Schema.Array(HostCapabilitySchema)),
  ),
  metadata: Schema.optionalKey(MetadataSchema),
});

export const HostGridViewCommandSchema = Schema.Struct({
  type: Schema.Literal("grid.applyView"),
  resourceId: NonEmptyStringSchema,
  view: Schema.Struct({
    filters: Schema.optionalKey(Schema.mutable(Schema.Array(HostGridFilterSchema))),
    sort: Schema.optionalKey(Schema.mutable(Schema.Array(HostGridSortSchema))),
    highlightRowIds: Schema.optionalKey(
      Schema.mutable(Schema.Array(NonEmptyStringSchema)),
    ),
  }),
});

export const HostGridClearCommandSchema = Schema.Struct({
  type: Schema.Literal("grid.clearView"),
  resourceId: NonEmptyStringSchema,
});

export const HostFocusResourceCommandSchema = Schema.Struct({
  type: Schema.Literal("ui.focusResource"),
  resourceId: NonEmptyStringSchema,
});

export const HostCustomCommandSchema = Schema.Struct({
  type: Schema.Literal("host.custom"),
  name: NonEmptyStringSchema,
  payload: Schema.optionalKey(MetadataSchema),
});

export const HostCommandSchema = Schema.Union([
  HostGridViewCommandSchema,
  HostGridClearCommandSchema,
  HostFocusResourceCommandSchema,
  HostCustomCommandSchema,
]);

export const HostCommandResultSchema = Schema.Struct({
  status: Schema.Literals(["applied", "rejected", "unsupported", "error"]),
  message: Schema.optionalKey(Schema.String),
  metadata: Schema.optionalKey(MetadataSchema),
});

export const SidechatRequestSchema = Schema.Struct({
  workspaceId: NonEmptyStringSchema,
  conversationId: Schema.optionalKey(Schema.String),
  message: ChatMessageSchema,
  model: ModelSelectionSchema,
  hostContext: Schema.optionalKey(HostContextSnapshotSchema),
});

export const SidechatStreamStartEventSchema = Schema.Struct({
  type: Schema.Literal("sidechat.started"),
  requestId: NonEmptyStringSchema,
  conversationId: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema,
  model: ModelSelectionSchema,
});

export const SidechatStreamDeltaEventSchema = Schema.Struct({
  type: Schema.Literal("sidechat.delta"),
  requestId: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema,
  content: Schema.String,
  index: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
});

export const SidechatStreamReasoningEventSchema = Schema.Struct({
  type: Schema.Literal("sidechat.reasoning"),
  requestId: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema,
  content: Schema.String,
  index: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
});

export const SidechatStreamToolEventSchema = Schema.Struct({
  type: Schema.Literal("sidechat.tool"),
  requestId: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema,
  toolCallId: NonEmptyStringSchema,
  toolName: NonEmptyStringSchema,
  status: Schema.Literals(["running", "completed", "error"]),
  input: Schema.optionalKey(Schema.Unknown),
  output: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(Schema.String),
  index: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
});

export const SidechatStreamHostCommandEventSchema = Schema.Struct({
  type: Schema.Literal("sidechat.host_command"),
  requestId: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema,
  commandId: NonEmptyStringSchema,
  command: HostCommandSchema,
  index: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
});

export const SidechatTokenUsageSchema = Schema.Struct({
  inputTokens: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
  outputTokens: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
  totalTokens: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
  reasoningTokens: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  ),
  cachedInputTokens: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  ),
  cacheWriteTokens: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  ),
  estimatedCostUsd: Schema.optionalKey(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  ),
});

export const SidechatStreamCompletedEventSchema = Schema.Struct({
  type: Schema.Literal("sidechat.completed"),
  requestId: NonEmptyStringSchema,
  conversationId: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema,
  model: ModelSelectionSchema,
  finishReason: NonEmptyStringSchema,
  usage: SidechatTokenUsageSchema,
  metadata: Schema.optionalKey(MetadataSchema),
});

export const SidechatStreamErrorEventSchema = Schema.Struct({
  type: Schema.Literal("sidechat.error"),
  requestId: NonEmptyStringSchema,
  code: NonEmptyStringSchema,
  message: NonEmptyStringSchema,
  retryable: Schema.Boolean,
});

export const SidechatStreamHistoryEventSchema = Schema.Struct({
  type: Schema.Literal("sidechat.history"),
  requestId: NonEmptyStringSchema,
  conversationId: NonEmptyStringSchema,
  messages: Schema.mutable(Schema.Array(ChatMessageSchema)),
});

export const SidechatStreamEventSchema = Schema.Union([
  SidechatStreamStartEventSchema,
  SidechatStreamDeltaEventSchema,
  SidechatStreamReasoningEventSchema,
  SidechatStreamToolEventSchema,
  SidechatStreamHostCommandEventSchema,
  SidechatStreamCompletedEventSchema,
  SidechatStreamErrorEventSchema,
  SidechatStreamHistoryEventSchema,
]);

export const SidechatHeadersSchema = Schema.Struct({
  "Content-Type": Schema.optionalKey(Schema.Literal("application/json")),
  Accept: Schema.optionalKey(Schema.Literal("text/event-stream")),
  "X-Sidechat-Protocol": Schema.Literal("sidechat.v1"),
  "X-Request-Id": Schema.optionalKey(Schema.String),
});

/**
 * Event-name constants for code that must talk about the protocol without
 * retyping string literals. The schemas above still own the actual shapes.
 */
export const protocolArtifacts = {
  protocol: "sidechat.v1",
  start: "sidechat.started",
  delta: "sidechat.delta",
  reasoning: "sidechat.reasoning",
  tool: "sidechat.tool",
  hostCommand: "sidechat.host_command",
  completed: "sidechat.completed",
  error: "sidechat.error",
  history: "sidechat.history",
} as const;
