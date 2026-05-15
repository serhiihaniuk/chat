import { Hono } from "hono";
import { Effect } from "effect";
import path from "node:path";
import {
  createPostgresAdvisoryDashboardDb,
  createPostgresSideChatPersistence,
} from "@side-chat/db";

import {
  encodeSseFrame,
  protocolArtifacts,
  SidechatProtocol,
  SidechatProtocolHeader,
  SidechatRequestIdHeader,
  SidechatRequestSchema,
  type ModelSelection,
  type SidechatStreamErrorEvent,
  type TokenUsage,
} from "@side-chat/shared-protocol";
import { fakeModelAdapter } from "../../adapters/ai/fake-model.js";
import { openAiModelAdapter } from "../../adapters/ai/openai-model.js";
import {
  createPlaywrightWorkbenchReportPort,
  readGeneratedReport,
} from "../../adapters/reports/playwright-report.js";
import { runEffectBoundary } from "../../application/effect-boundary.js";
import { SideChatDomainError } from "../../application/errors.js";
import {
  streamChatEffect,
  type StreamChatDeps,
} from "../../application/stream-chat.js";
import type {
  ConversationRepository,
  PageContextPort,
  UsagePort,
  WorkbenchQueryName,
  WorkbenchToolsPort,
} from "../../ports/index.js";
import { parseSideChatEnv } from "./config.js";

const protocol = protocolArtifacts;

const models: ModelSelection[] = [
  { provider: "openai", id: "gpt-5.4-nano", reasoningEffort: "medium" },
];

const reportStore = {
  directory: path.resolve(process.cwd(), ".sidechat-reports"),
  publicBasePath:
    process.env.SIDE_CHAT_PUBLIC_REPORT_BASE_PATH ??
    `http://127.0.0.1:${process.env.PORT ?? "3000"}/reports`,
};

const createDefaultPageContext = (): PageContextPort => ({
  async resolve({ workspaceId }) {
    if (workspaceId !== "demo-workspace") return undefined;

    return {
      pageId: "advisory-workbench",
      title: "UBS Partner Advisory Workbench",
      summary:
        "A single-page UBS Partner dashboard for relationship, portfolio performance, advisory coverage, risk, and compliance review.",
      facts: [
        "Top KPIs include Total AUM CHF 24.8B, Net New Money CHF 562M, Advisory Coverage 78%, At-Risk Accounts 52, Client Meetings 212, and Compliance Alerts 7.",
        "The primary table is Client Portfolio Review with client segment, AUM, 30D net flow, risk profile, suitability score, coverage status, last review, relationship manager, next action, and alert state.",
        "Secondary sections summarize Top Risk Accounts, Product Allocation Overview, and Net New Money Trend.",
        "The visual direction is UBS-inspired: restrained white, charcoal, light gray dividers, and red accent.",
      ],
    };
  },
});

type ClientPortfolioReviewToolRow = {
  client: string;
  segment?: string;
  aumChf: number;
  coverageStatus: string;
  riskProfile: string;
  relationshipManager?: string;
  nextAction: string;
  hasAlert: boolean;
};

const clientPortfolioReviewFallback: ClientPortfolioReviewToolRow[] = [
  {
    client: "Ackermann Family Office",
    segment: "UHNW",
    aumChf: 3_428_000_000,
    coverageStatus: "Covered",
    riskProfile: "Balanced",
    relationshipManager: "S. Meier",
    nextAction: "Portfolio review",
    hasAlert: false,
  },
  {
    client: "Bauhaus Enterprises AG",
    segment: "Corporate",
    aumChf: 1_980_000_000,
    coverageStatus: "Covered",
    riskProfile: "Moderate",
    relationshipManager: "M. Keller",
    nextAction: "Cash sweep",
    hasAlert: false,
  },
  {
    client: "Chen Private Wealth",
    segment: "HNW",
    aumChf: 1_450_000_000,
    coverageStatus: "Watch",
    riskProfile: "Growth",
    relationshipManager: "L. Rossi",
    nextAction: "Rebalance",
    hasAlert: true,
  },
  {
    client: "Delaunay Holdings",
    segment: "Corporate",
    aumChf: 1_210_000_000,
    coverageStatus: "Watch",
    riskProfile: "Balanced",
    relationshipManager: "T. Nguyen",
    nextAction: "Derivatives review",
    hasAlert: false,
  },
  {
    client: "Equinox Partners LLP",
    segment: "Institutional",
    aumChf: 982_000_000,
    coverageStatus: "Covered",
    riskProfile: "Moderate",
    relationshipManager: "A. Patel",
    nextAction: "Performance update",
    hasAlert: false,
  },
  {
    client: "Global MedTech Inc.",
    segment: "Corporate",
    aumChf: 654_000_000,
    coverageStatus: "At Risk",
    riskProfile: "Balanced",
    relationshipManager: "R. Li",
    nextAction: "Liquidity plan",
    hasAlert: true,
  },
  {
    client: "Jasper Retail Group",
    segment: "Corporate",
    aumChf: 487_000_000,
    coverageStatus: "At Risk",
    riskProfile: "Moderate",
    relationshipManager: "J. Colombo",
    nextAction: "Credit review",
    hasAlert: true,
  },
];

const compactClientPortfolioRows = (
  rows: ClientPortfolioReviewToolRow[],
): ClientPortfolioReviewToolRow[] =>
  [...rows]
    .sort((left, right) => right.aumChf - left.aumChf)
    .map((row) => ({
      client: row.client,
      segment: row.segment,
      aumChf: row.aumChf,
      coverageStatus: row.coverageStatus,
      riskProfile: row.riskProfile,
      relationshipManager: row.relationshipManager,
      nextAction: row.nextAction,
      hasAlert: row.hasAlert,
    }));

const fallbackWorkbenchData = {
  dashboard_snapshot: {
    kpis: {
      totalAum: "CHF 24.8B",
      netNewMoney: "CHF 562M",
      advisoryCoverage: "78%",
      atRiskAccounts: 52,
      clientMeetings: 212,
      complianceAlerts: 7,
    },
  },
  client_portfolio_review: compactClientPortfolioRows(
    clientPortfolioReviewFallback,
  ),
  top_risk_accounts: [
    { client: "Global MedTech Inc.", issue: "Liquidity gap", priority: "High" },
    {
      client: "Jasper Retail Group",
      issue: "Credit concentration",
      priority: "High",
    },
  ],
  product_allocation: [
    { assetClass: "Equities", currentPercent: 48, targetPercent: 50 },
    { assetClass: "Fixed Income", currentPercent: 28, targetPercent: 25 },
  ],
  net_new_money_trend: [
    { label: "Jan '25", netNewMoneyChf: 260_000_000 },
    { label: "Jun '25", netNewMoneyChf: 620_000_000 },
  ],
} satisfies Record<WorkbenchQueryName, unknown>;

const createWorkbenchTools = (databaseUrl?: string): WorkbenchToolsPort => {
  const advisoryDashboard = databaseUrl
    ? createPostgresAdvisoryDashboardDb(databaseUrl)
    : undefined;

  return {
    async query({ workspaceId, query }) {
      let data: unknown;

      if (advisoryDashboard) {
        switch (query.query) {
          case "dashboard_snapshot":
            data =
              await advisoryDashboard.getAdvisoryDashboardSnapshot(workspaceId);
            break;
          case "client_portfolio_review":
            data = compactClientPortfolioRows(
              await advisoryDashboard.listClientPortfolioReview(workspaceId),
            );
            break;
          case "top_risk_accounts":
            data = await advisoryDashboard.listTopRiskAccounts(workspaceId);
            break;
          case "product_allocation":
            data = await advisoryDashboard.listProductAllocation(workspaceId);
            break;
          case "net_new_money_trend":
            data = await advisoryDashboard.listNetNewMoneyTrend(workspaceId);
            break;
        }
      } else {
        data = fallbackWorkbenchData[query.query];
      }

      return {
        query: query.query,
        workspaceId,
        data,
      };
    },
  };
};

const createMemoryConversationRepository = (): ConversationRepository => {
  const messages = new Map<
    string,
    {
      role: "user" | "assistant";
      messageId: string;
      content: string;
      model?: ModelSelection;
    }[]
  >();

  return {
    async createOrGet({ conversationId }) {
      const id = conversationId ?? crypto.randomUUID();
      if (!messages.has(id)) messages.set(id, []);
      return id;
    },
    async appendUserMessage(conversationId, messageId, content) {
      messages.get(conversationId)?.push({ role: "user", messageId, content });
    },
    async appendAssistantMessage(conversationId, messageId, content, model) {
      messages
        .get(conversationId)
        ?.push({ role: "assistant", messageId, content, model });
    },
    async readSeededHistory(workspaceId, conversationId) {
      if (!conversationId) return [];
      if (!messages.has(conversationId)) return [];

      return messages.get(conversationId)!.map((entry) => ({
        id: entry.messageId,
        role: entry.role,
        content: entry.content,
      }));
    },
  };
};

const createMemoryUsageRepository = (): UsagePort => {
  const records: Array<{
    workspaceId: string;
    userId: string;
    conversationId: string;
    usage: TokenUsage;
    createdAt: number;
  }> = [];

  return {
    async record({ conversationId, usage }) {
      records.push({
        workspaceId: "demo-workspace",
        userId: "local-user",
        conversationId,
        usage,
        createdAt: Date.now(),
      });
    },
    async latest({ workspaceId, userId, conversationId }) {
      return records
        .filter(
          (record) =>
            record.workspaceId === workspaceId &&
            record.userId === userId &&
            record.conversationId === conversationId,
        )
        .sort((left, right) => right.createdAt - left.createdAt)[0]?.usage;
    },
  };
};

export const createDefaultDeps = (): StreamChatDeps => {
  const env = parseSideChatEnv();
  const persistence = env.DATABASE_URL
    ? createPostgresSideChatPersistence(env.DATABASE_URL)
    : undefined;
  const allowlist = env.SIDE_CHAT_ALLOWED_WORKSPACE_IDS
    ? env.SIDE_CHAT_ALLOWED_WORKSPACE_IDS.split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;
  const blocklist = env.SIDE_CHAT_BLOCKED_WORKSPACE_IDS
    ? env.SIDE_CHAT_BLOCKED_WORKSPACE_IDS.split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;

  return {
    model:
      !env.USE_FAKE_MODEL &&
      env.SIDE_CHAT_MODEL_ADAPTER === "openai" &&
      env.OPENAI_API_KEY
        ? openAiModelAdapter
        : fakeModelAdapter,
    pageContext: createDefaultPageContext(),
    workbenchTools: createWorkbenchTools(env.DATABASE_URL),
    workbenchReports: createPlaywrightWorkbenchReportPort(reportStore),
    conversations:
      persistence?.conversations ?? createMemoryConversationRepository(),
    usage: persistence?.usage ?? createMemoryUsageRepository(),
    auth: {
      async authorize(workspaceId) {
        if (allowlist && allowlist.length > 0)
          return allowlist.includes(workspaceId);
        if (blocklist && blocklist.includes(workspaceId)) return false;
        return true;
      },
    },
    rateLimit: {
      async check(_workspaceId, _userId) {
        return env.SIDE_CHAT_RATE_LIMITING_ENABLED;
      },
    },
    billing: {
      async allow(_workspaceId) {
        return env.SIDE_CHAT_BILLING_ENABLED;
      },
    },
    observability: {
      lifecycle() {},
      counter() {},
      async span(_name, run) {
        return run();
      },
    },
    config: {
      models() {
        return models;
      },
      defaultUserId() {
        return env.SIDE_CHAT_DEFAULT_USER_ID;
      },
    },
  };
};

const toProtocolError = (
  requestId: string,
  error: unknown,
): SidechatStreamErrorEvent => {
  if (error instanceof SideChatDomainError) {
    return {
      type: protocol.error,
      requestId,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }

  return {
    type: protocol.error,
    requestId,
    code: "InternalError",
    message:
      error instanceof Error ? error.message : "Unexpected stream failure",
    retryable: false,
  };
};

const preStreamErrorResponse = (
  requestId: string,
  status: 400,
  code: string,
  message: string,
) =>
  new Response(
    JSON.stringify({
      error: {
        code,
        message,
        requestId,
        retryable: false,
      },
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        [SidechatProtocolHeader]: protocol.protocol,
        [SidechatRequestIdHeader]: requestId,
      },
    },
  );

const streamEvents = (
  deps: StreamChatDeps,
  body: unknown,
  requestId: string,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        await runEffectBoundary(() =>
          deps.observability.span("sidechat.stream", async () => {
            const events = await Effect.runPromise(
              streamChatEffect(deps, { requestId, body, signal }),
            );
            for await (const event of events) {
              controller.enqueue(encoder.encode(`${encodeSseFrame(event)}\n`));
            }
          }),
        );
      } catch (error) {
        const protocolError = toProtocolError(requestId, error);
        deps.observability.lifecycle(protocolError);
        deps.observability.counter("sidechat.stream.error", {
          code: protocolError.code,
        });
        controller.enqueue(
          encoder.encode(`${encodeSseFrame(protocolError)}\n`),
        );
      } finally {
        controller.close();
      }
    },
  });
};

export const createInboundApp = (
  deps: StreamChatDeps = createDefaultDeps(),
) => {
  const app = new Hono();

  app.get(SidechatProtocol.healthRoute, (c) => c.json({ ok: true }));
  app.get(SidechatProtocol.modelsRoute, (c) =>
    c.json({ models: deps.config.models() }),
  );

  app.get("/reports/:fileName", async (c) => {
    const fileName = c.req.param("fileName");
    const file = await readGeneratedReport(reportStore, fileName);
    if (!file) return c.text("Report not found", 404);

    return new Response(file, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  });

  app.get("/chat/history", async (c) => {
    const workspaceId = c.req.query("workspaceId") ?? "";
    const conversationId = c.req.query("conversationId") ?? "";

    if (!workspaceId || !conversationId) {
      return c.json(
        { error: "workspaceId and conversationId are required" },
        400,
      );
    }

    const isAuthorized = await deps.auth.authorize(
      workspaceId,
      deps.config.defaultUserId(),
    );
    if (!isAuthorized) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const rows = await deps.conversations.readSeededHistory(
      workspaceId,
      conversationId,
    );
    return c.json({ conversationId, messages: rows });
  });

  app.get("/chat/usage", async (c) => {
    const workspaceId = c.req.query("workspaceId") ?? "";
    const conversationId = c.req.query("conversationId") ?? "";

    if (!workspaceId || !conversationId) {
      return c.json(
        { error: "workspaceId and conversationId are required" },
        400,
      );
    }

    const userId = deps.config.defaultUserId();
    const isAuthorized = await deps.auth.authorize(workspaceId, userId);
    if (!isAuthorized) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const usage = await deps.usage.latest({
      workspaceId,
      userId,
      conversationId,
    });
    return c.json({ conversationId, usage: usage ?? null });
  });

  app.post(SidechatProtocol.streamRoute, async (c) => {
    const requestId =
      c.req.header(SidechatRequestIdHeader) ?? crypto.randomUUID();
    const protocolHeader = c.req.header(SidechatProtocolHeader);

    if (protocolHeader !== protocol.protocol) {
      return preStreamErrorResponse(
        requestId,
        400,
        "InvalidProtocol",
        "X-Sidechat-Protocol: sidechat.v1 is required",
      );
    }

    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      body = undefined;
    }

    const parsed = SidechatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return preStreamErrorResponse(
        requestId,
        400,
        "InvalidRequest",
        "workspaceId, message.content and model.id are required",
      );
    }

    return c.body(
      streamEvents(deps, parsed.data, requestId, c.req.raw.signal),
      200,
      {
        "Content-Type": SidechatProtocol.streamContentType,
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        [SidechatProtocolHeader]: protocol.protocol,
        [SidechatRequestIdHeader]: requestId,
      },
    );
  });

  return app;
};

export const inboundApp = createInboundApp();
