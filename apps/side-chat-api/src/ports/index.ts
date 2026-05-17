import type {
  ChatMessage,
  CitationSource,
  HostCommand,
  HostGridFilter,
  HostGridSort,
  ModelSelection,
  SidechatRequest,
  SidechatStreamEvent,
  TokenUsage,
} from "@side-chat/shared-protocol";

/**
 * Backend hexagon ports. The application use case depends on these interfaces,
 * while Hono, AI SDK, Postgres, reports, auth, and telemetry plug in as adapters.
 */
export type ResolvedPageContext = {
  pageId: string;
  title: string;
  summary: string;
  facts: string[];
};

export const workbenchQueryNames = [
  "dashboard_snapshot",
  "client_portfolio_review",
  "top_risk_accounts",
  "product_allocation",
  "net_new_money_trend",
] as const;

export type WorkbenchQueryName = (typeof workbenchQueryNames)[number];

export type WorkbenchQueryInput = {
  query: WorkbenchQueryName;
};

export type WorkbenchCitationSource = CitationSource;

export type WorkbenchQueryResult = {
  query: WorkbenchQueryName;
  workspaceId: string;
  data: unknown;
  sources: WorkbenchCitationSource[];
};

export type WorkbenchSurfaceRow = {
  id: string;
  label: string;
  sourceId?: string;
  cells: Record<string, string | number | boolean | null>;
};

export type WorkbenchSurfaceContextResult = {
  resourceId: string;
  label: string;
  workspaceId: string;
  guidance?: string[];
  rowCount: number;
  totalRowCount: number;
  filters?: HostGridFilter[];
  sort?: HostGridSort[];
  rows: WorkbenchSurfaceRow[];
  sources: WorkbenchCitationSource[];
};

export interface WorkbenchToolsPort {
  query(input: {
    workspaceId: string;
    userId: string;
    conversationId?: string;
    pageContext?: ResolvedPageContext;
    query: WorkbenchQueryInput;
  }): Promise<WorkbenchQueryResult>;
  surfaceContext?(input: {
    workspaceId: string;
    userId: string;
    conversationId?: string;
    pageContext?: ResolvedPageContext;
    resourceId: string;
    limit: number;
  }): Promise<WorkbenchSurfaceContextResult>;
}

export type HostGridViewState = {
  filters?: HostGridFilter[];
  sort?: HostGridSort[];
  highlightRowIds?: string[];
};

export interface HostSurfaceStatePort {
  applyCommand(input: {
    workspaceId: string;
    userId: string;
    conversationId: string;
    command: HostCommand;
  }): Promise<void>;
  getGridView(input: {
    workspaceId: string;
    userId: string;
    conversationId?: string;
    resourceId: string;
  }): Promise<HostGridViewState | undefined>;
}

export const workbenchReportSectionNames = [
  "kpis",
  "biggest_clients",
  "risk_accounts",
  "product_allocation",
  "net_new_money_trend",
] as const;

export type WorkbenchReportSectionName =
  (typeof workbenchReportSectionNames)[number];

export const workbenchReportFocusNames = [
  "executive_summary",
  "risk_review",
  "client_coverage",
  "portfolio_allocation",
] as const;

export type WorkbenchReportFocusName = (typeof workbenchReportFocusNames)[number];

export const workbenchReportNoteKinds = [
  "analyst_note",
  "risk_rationale",
  "next_action",
  "custom",
] as const;

export type WorkbenchReportNoteKind = (typeof workbenchReportNoteKinds)[number];

export type WorkbenchReportInput = {
  title?: string;
  focus?: WorkbenchReportFocusName;
  sections?: WorkbenchReportSectionName[];
  noteKind?: WorkbenchReportNoteKind;
  note?: string;
};

export type WorkbenchReportResult = {
  reportId: string;
  fileName: string;
  reportUrl: string;
  title: string;
  pages: 1;
  sections: WorkbenchReportSectionName[];
};

export interface WorkbenchReportPort {
  generate(input: {
    workspaceId: string;
    userId: string;
    pageContext?: ResolvedPageContext;
    report: WorkbenchReportInput;
    workbenchTools: WorkbenchToolsPort;
  }): Promise<WorkbenchReportResult>;
}

export type ModelRequest = SidechatRequest & {
  pageContext?: ResolvedPageContext;
  surfaceContexts?: WorkbenchSurfaceContextResult[];
  recentMessages?: ChatMessage[];
  userId?: string;
  workbenchTools?: WorkbenchToolsPort;
  workbenchReports?: WorkbenchReportPort;
};

export type ModelChunk =
  | { kind: "delta"; text: string }
  | { kind: "reasoning"; text: string }
  | {
      kind: "tool";
      toolCallId: string;
      toolName: string;
      status: "running" | "completed" | "error";
      input?: unknown;
      output?: unknown;
      error?: string;
    }
  | { kind: "host-command"; commandId: string; command: HostCommand }
  | { kind: "done"; finishReason: string; usage: TokenUsage };

export interface ModelPort {
  stream(
    request: ModelRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ModelChunk>;
}

export interface PageContextPort {
  resolve(input: {
    workspaceId: string;
    userId: string;
    conversationId?: string;
  }): Promise<ResolvedPageContext | undefined>;
}

export interface ConversationRepository {
  createOrGet(input: {
    workspaceId: string;
    userId: string;
    conversationId?: string;
  }): Promise<string>;
  appendUserMessage(
    conversationId: string,
    messageId: string,
    content: string,
  ): Promise<void>;
  appendAssistantMessage(
    conversationId: string,
    messageId: string,
    content: string,
    model: ModelSelection,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  readSeededHistory(
    workspaceId: string,
    conversationId: string,
  ): Promise<
    Array<{
      id: string;
      role: "user" | "assistant" | "system";
      content: string;
      metadata?: Record<string, unknown>;
    }>
  >;
  resetHistory?(input: {
    workspaceId: string;
    userId: string;
    conversationId: string;
  }): Promise<{ deletedMessages: number }>;
}

export interface UsagePort {
  record(input: {
    requestId: string;
    conversationId: string;
    messageId: string;
    model: ModelSelection;
    usage: TokenUsage;
  }): Promise<void>;
  latest(input: {
    workspaceId: string;
    userId: string;
    conversationId: string;
  }): Promise<TokenUsage | undefined>;
  reset?(input: {
    workspaceId: string;
    userId: string;
    conversationId: string;
  }): Promise<{ deletedUsageRecords: number }>;
}

export interface AuthPort {
  authorize(workspaceId: string, userId: string): Promise<boolean>;
}
export interface RateLimitPort {
  check(workspaceId: string, userId: string): Promise<boolean>;
}
export interface BillingPort {
  allow(workspaceId: string): Promise<boolean>;
}
export interface ObservabilityPort {
  lifecycle(event: SidechatStreamEvent): void;
  counter(name: string, tags?: Record<string, string>): void;
  span<T>(name: string, run: () => Promise<T>): Promise<T>;
}
export interface ConfigPort {
  models(): ModelSelection[];
  defaultUserId(): string;
}
