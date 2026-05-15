import type {
  ChatMessage,
  ModelSelection,
  SidechatRequest,
  SidechatStreamEvent,
  TokenUsage,
} from "@side-chat/shared-protocol";

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

export type WorkbenchQueryResult = {
  query: WorkbenchQueryName;
  workspaceId: string;
  data: unknown;
};

export interface WorkbenchToolsPort {
  query(input: {
    workspaceId: string;
    userId: string;
    pageContext?: ResolvedPageContext;
    query: WorkbenchQueryInput;
  }): Promise<WorkbenchQueryResult>;
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

export type WorkbenchReportInput = {
  title?: string;
  focus?: WorkbenchReportFocusName;
  sections?: WorkbenchReportSectionName[];
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
  ): Promise<void>;
  readSeededHistory(
    workspaceId: string,
    conversationId: string,
  ): Promise<
    Array<{
      id: string;
      role: "user" | "assistant" | "system";
      content: string;
    }>
  >;
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
