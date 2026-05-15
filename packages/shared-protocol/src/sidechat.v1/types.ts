export const SidechatProtocolVersion = "sidechat.v1" as const;
export type Role = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface CitationSource {
  sourceId: string;
  label: string;
  dataset: string;
  resourceId?: string;
  rowId?: string;
  field?: string;
}

export interface ModelSelection {
  provider: string;
  id: string;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
}

export type HostResourceKind =
  | "grid"
  | "table"
  | "chart"
  | "form"
  | "page"
  | "custom";

export type HostResourceColumnType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "currency"
  | "percent"
  | "custom";

export interface HostResourceColumn {
  id: string;
  label: string;
  type: HostResourceColumnType;
  description?: string;
  sortable?: boolean;
  filterable?: boolean;
}

export interface HostGridFilter {
  columnId: string;
  operator:
    | "equals"
    | "notEquals"
    | "contains"
    | "startsWith"
    | "endsWith"
    | "greaterThan"
    | "greaterThanOrEqual"
    | "lessThan"
    | "lessThanOrEqual"
    | "between"
    | "in"
    | "blank"
    | "notBlank";
  value?: unknown;
}

export interface HostGridSort {
  columnId: string;
  direction: "asc" | "desc";
}

export interface HostResource {
  id: string;
  kind: HostResourceKind;
  label: string;
  description?: string;
  rowCount?: number;
  columns?: HostResourceColumn[];
  metadata?: Record<string, unknown>;
}

export interface HostCapability {
  id: string;
  label: string;
  description?: string;
  commandTypes?: string[];
}

export interface HostContextSnapshot {
  pageId: string;
  title: string;
  summary?: string;
  resources?: HostResource[];
  capabilities?: HostCapability[];
  metadata?: Record<string, unknown>;
}

export interface HostGridViewCommand {
  type: "grid.applyView";
  resourceId: string;
  view: {
    filters?: HostGridFilter[];
    sort?: HostGridSort[];
    highlightRowIds?: string[];
  };
}

export interface HostGridClearCommand {
  type: "grid.clearView";
  resourceId: string;
}

export interface HostFocusResourceCommand {
  type: "ui.focusResource";
  resourceId: string;
}

export interface HostCustomCommand {
  type: "host.custom";
  name: string;
  payload?: Record<string, unknown>;
}

export type HostCommand =
  | HostGridViewCommand
  | HostGridClearCommand
  | HostFocusResourceCommand
  | HostCustomCommand;

export interface HostCommandResult {
  status: "applied" | "rejected" | "unsupported" | "error";
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface SidechatStreamStartEvent {
  type: "sidechat.started";
  requestId: string;
  conversationId: string;
  messageId: string;
  model: ModelSelection;
}

export interface SidechatStreamDeltaEvent {
  type: "sidechat.delta";
  requestId: string;
  messageId: string;
  content: string;
  index: number;
}

export interface SidechatStreamReasoningEvent {
  type: "sidechat.reasoning";
  requestId: string;
  messageId: string;
  content: string;
  index: number;
}

export interface SidechatStreamToolEvent {
  type: "sidechat.tool";
  requestId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  status: "running" | "completed" | "error";
  input?: unknown;
  output?: unknown;
  error?: string;
  index: number;
}

export interface SidechatStreamHostCommandEvent {
  type: "sidechat.host_command";
  requestId: string;
  messageId: string;
  commandId: string;
  command: HostCommand;
  index: number;
}

export interface SidechatStreamCompletedEvent {
  type: "sidechat.completed";
  requestId: string;
  conversationId: string;
  messageId: string;
  model: ModelSelection;
  finishReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
    cacheWriteTokens?: number;
    estimatedCostUsd?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface SidechatStreamErrorEvent {
  type: "sidechat.error";
  requestId: string;
  code: string;
  message: string;
  retryable: boolean;
}

export interface SidechatStreamHistoryEvent {
  type: "sidechat.history";
  requestId: string;
  conversationId: string;
  messages: ChatMessage[];
}

export type SidechatStreamEvent =
  | SidechatStreamStartEvent
  | SidechatStreamDeltaEvent
  | SidechatStreamReasoningEvent
  | SidechatStreamToolEvent
  | SidechatStreamHostCommandEvent
  | SidechatStreamCompletedEvent
  | SidechatStreamErrorEvent
  | SidechatStreamHistoryEvent;

export interface SidechatRequest {
  workspaceId: string;
  conversationId?: string;
  message: ChatMessage;
  model: ModelSelection;
  hostContext?: HostContextSnapshot;
}

export interface SidechatRequestHeaders {
  protocol: "sidechat.v1";
  requestId?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  estimatedCostUsd?: number;
}
