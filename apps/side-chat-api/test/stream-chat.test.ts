import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  selectInlineCitationSources,
  streamChat,
  streamChatEffect,
} from "#application/stream-chat.js";
import {
  BillingDenied,
  InvalidRequest,
  ModelUnavailable,
  RateLimited,
  Unauthorized,
  UsageCaptureFailed,
} from "#application/errors.js";
import type { StreamChatDeps } from "#application/stream-chat.js";

const collect = async (
  deps: StreamChatDeps,
  body: unknown,
  requestId = "req-1",
) => {
  const events: unknown[] = [];
  for await (const event of streamChat(deps, { requestId, body })) {
    events.push(event);
  }
  return events;
};

const validRequest = {
  workspaceId: "demo-workspace",
  message: { id: "msg-1", role: "user", content: "hello" },
  model: { provider: "openai", id: "gpt-4.1-mini" },
};

const baseDeps: StreamChatDeps = {
  model: {
    async *stream() {
      yield { kind: "delta", text: "A" };
      yield {
        kind: "done",
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    },
  },
  pageContext: {
    async resolve() {
      return undefined;
    },
  },
  conversations: {
    async createOrGet() {
      return "conv-1";
    },
    async appendUserMessage() {},
    async appendAssistantMessage() {},
    async readSeededHistory() {
      return [];
    },
  },
  usage: { async record() {} },
  auth: {
    async authorize() {
      return true;
    },
  },
  rateLimit: {
    async check() {
      return true;
    },
  },
  billing: {
    async allow() {
      return true;
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
      return [{ provider: "openai", id: "gpt-4.1-mini" }];
    },
    defaultUserId() {
      return "demo-user";
    },
  },
};

describe("streamChat", () => {
  it("exposes the streaming use case through an Effect v4 boundary", async () => {
    const stream = await Effect.runPromise(
      streamChatEffect(baseDeps, {
        requestId: "req-effect",
        body: validRequest,
      }),
    );
    const events = [];

    for await (const event of stream) events.push(event.type);

    expect(events).toEqual([
      "sidechat.started",
      "sidechat.delta",
      "sidechat.completed",
    ]);
  });

  it("decodes invalid request bodies as typed Effect application errors", async () => {
    await expect(
      Effect.runPromise(
        streamChatEffect(baseDeps, {
          requestId: "req-invalid-effect",
          body: {
            workspaceId: "",
            message: { id: "msg-1", role: "user", content: "" },
            model: { provider: "openai", id: "" },
          },
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidRequest);
  });

  it("emits started/delta/completed for a valid request", async () => {
    const events = await collect(baseDeps, validRequest);
    expect(events.map((e) => (e as { type: string }).type)).toEqual([
      "sidechat.started",
      "sidechat.delta",
      "sidechat.completed",
    ]);
  });

  it("emits host command events from the model stream", async () => {
    const deps: StreamChatDeps = {
      ...baseDeps,
      model: {
        async *stream() {
          yield {
            kind: "host-command",
            commandId: "command-1",
            command: {
              type: "ui.focusResource",
              resourceId: "clientPortfolio",
            },
          };
          yield {
            kind: "done",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      },
    };

    const events = await collect(deps, validRequest);

    expect(events.map((e) => (e as { type: string }).type)).toEqual([
      "sidechat.started",
      "sidechat.host_command",
      "sidechat.completed",
    ]);
    expect(events[1]).toMatchObject({
      type: "sidechat.host_command",
      commandId: "command-1",
    });
  });

  it("stops streaming after the first terminal model chunk", async () => {
    const deps: StreamChatDeps = {
      ...baseDeps,
      model: {
        async *stream() {
          yield { kind: "delta", text: "Final answer." };
          yield {
            kind: "done",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
          yield { kind: "delta", text: " late content" };
        },
      },
    };

    const events = await collect(deps, validRequest);

    expect(events.map((event) => (event as { type: string }).type)).toEqual([
      "sidechat.started",
      "sidechat.delta",
      "sidechat.completed",
    ]);
  });

  it("records host command view state in the backend boundary", async () => {
    const appliedCommands: unknown[] = [];
    const deps: StreamChatDeps = {
      ...baseDeps,
      hostSurfaceState: {
        async applyCommand(input) {
          appliedCommands.push(input);
        },
        async getGridView() {
          return undefined;
        },
      },
      model: {
        async *stream() {
          yield {
            kind: "host-command",
            commandId: "command-1",
            command: {
              type: "grid.applyView",
              resourceId: "advisoryWorklist",
              view: {
                filters: [
                  {
                    columnId: "dueStatus",
                    operator: "equals",
                    value: "Open",
                  },
                ],
                sort: [{ columnId: "dueDate", direction: "asc" }],
              },
            },
          };
          yield {
            kind: "done",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      },
    };

    await collect(deps, validRequest);

    expect(appliedCommands).toEqual([
      {
        workspaceId: "demo-workspace",
        userId: "demo-user",
        conversationId: "conv-1",
        command: {
          type: "grid.applyView",
          resourceId: "advisoryWorklist",
          view: {
            filters: [
              {
                columnId: "dueStatus",
                operator: "equals",
                value: "Open",
              },
            ],
            sort: [{ columnId: "dueDate", direction: "asc" }],
          },
        },
      },
    ]);
  });

  it("resolves backend surface state for visible host resources before model streaming", async () => {
    const seenSurfaceContexts: unknown[] = [];
    const deps: StreamChatDeps = {
      ...baseDeps,
      workbenchTools: {
        async query() {
          return {
            query: "dashboard_snapshot",
            workspaceId: "demo-workspace",
            data: {},
            sources: [],
          };
        },
        async surfaceContext(input) {
          expect(input).toMatchObject({
            workspaceId: "demo-workspace",
            userId: "demo-user",
            conversationId: "conv-1",
            resourceId: "advisoryWorklist",
            limit: 12,
          });
          return {
            resourceId: input.resourceId,
            label: "Portfolio Worklist",
            workspaceId: input.workspaceId,
            guidance: ["This is what the user currently sees on the page."],
            rowCount: 7,
            totalRowCount: 34,
            filters: [
              { columnId: "dueStatus", operator: "equals", value: "Open" },
            ],
            sort: [{ columnId: "dueDate", direction: "asc" }],
            rows: [
              {
                id: "review-global-medtech-inc",
                label: "Global MedTech Inc.",
                cells: { client: "Global MedTech Inc.", dueStatus: "Open" },
              },
            ],
            sources: [],
          };
        },
      },
      model: {
        async *stream(request) {
          seenSurfaceContexts.push(request.surfaceContexts);
          yield {
            kind: "done",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      },
    };

    await collect(deps, {
      ...validRequest,
      hostContext: {
        pageId: "advisory-workbench",
        title: "Advisory Workbench",
        resources: [
          {
            id: "advisoryWorklist",
            kind: "grid",
            label: "Portfolio Worklist",
          },
        ],
      },
    });

    expect(seenSurfaceContexts).toEqual([
      [
        {
          resourceId: "advisoryWorklist",
          label: "Portfolio Worklist",
          workspaceId: "demo-workspace",
          guidance: ["This is what the user currently sees on the page."],
          rowCount: 7,
          totalRowCount: 34,
          filters: [
            { columnId: "dueStatus", operator: "equals", value: "Open" },
          ],
          sort: [{ columnId: "dueDate", direction: "asc" }],
          rows: [
            {
              id: "review-global-medtech-inc",
              label: "Global MedTech Inc.",
              cells: { client: "Global MedTech Inc.", dueStatus: "Open" },
            },
          ],
          sources: [],
        },
      ],
    ]);
  });

  it("resolves current page context inside the backend boundary", async () => {
    const seenContexts: unknown[] = [];
    const deps: StreamChatDeps = {
      ...baseDeps,
      model: {
        async *stream(request) {
          seenContexts.push(request.pageContext);
          yield {
            kind: "done",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      },
      pageContext: {
        async resolve(input) {
          expect(input).toMatchObject({
            workspaceId: "demo-workspace",
            userId: "demo-user",
            conversationId: "conv-1",
          });
          return {
            pageId: "advisory-workbench",
            title: "UBS Partner Advisory Workbench",
            summary: "Dashboard context resolved by the API.",
            facts: ["At-Risk Accounts is 52."],
          };
        },
      },
    };

    await collect(deps, validRequest);

    expect(seenContexts).toEqual([
      {
        pageId: "advisory-workbench",
        title: "UBS Partner Advisory Workbench",
        summary: "Dashboard context resolved by the API.",
        facts: ["At-Risk Accounts is 52."],
      },
    ]);
  });

  it("passes existing visible conversation history to the model before appending the new user message", async () => {
    const seenHistory: unknown[] = [];
    const deps: StreamChatDeps = {
      ...baseDeps,
      model: {
        async *stream(request) {
          seenHistory.push(request.recentMessages);
          yield {
            kind: "done",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      },
      conversations: {
        ...baseDeps.conversations,
        async readSeededHistory() {
          return [
            { id: "u-prev", role: "user", content: "previous visible user message" },
            { id: "a-prev", role: "assistant", content: "previous visible assistant reply" },
          ];
        },
      },
    };

    await collect(deps, validRequest);

    expect(seenHistory).toEqual([
      [
        { id: "u-prev", role: "user", content: "previous visible user message" },
        {
          id: "a-prev",
          role: "assistant",
          content: "previous visible assistant reply",
        },
      ],
    ]);
  });

  it("persists only the citation source that matches the assistant answer", async () => {
    let persistedContent = "";
    let persistedMetadata: Record<string, unknown> | undefined;
    const deps: StreamChatDeps = {
      ...baseDeps,
      model: {
        async *stream() {
          yield {
            kind: "tool",
            toolCallId: "tool-1",
            toolName: "workbench_query",
            status: "completed",
            input: { query: "client_portfolio_review" },
            output: {
              sources: [
                {
                  sourceId: "client_portfolio_review:review-ackermann-family-office",
                  label: "Client Portfolio Review · Ackermann Family Office",
                  dataset: "client_portfolio_review",
                  rowId: "review-ackermann-family-office",
                },
                {
                  sourceId: "client_portfolio_review:review-bauhaus-enterprises-ag",
                  label: "Client Portfolio Review · Bauhaus Enterprises AG",
                  dataset: "client_portfolio_review",
                  rowId: "review-bauhaus-enterprises-ag",
                },
              ],
            },
          };
          yield {
            kind: "delta",
            text: "Our biggest client is Ackermann Family Office.",
          };
          yield {
            kind: "done",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      },
      conversations: {
        ...baseDeps.conversations,
        async appendAssistantMessage(
          _conversationId,
          _messageId,
          content,
          _model,
          metadata,
        ) {
          persistedContent = content;
          persistedMetadata = metadata;
        },
      },
    };

    const events = await collect(deps, validRequest);
    const completed = events.find(
      (event): event is { type: "sidechat.completed"; metadata?: unknown } =>
        typeof event === "object" &&
        event !== null &&
        "type" in event &&
        event.type === "sidechat.completed",
    );

    expect(persistedContent).toBe(
      "Our biggest client is Ackermann Family Office.",
    );
    expect(persistedMetadata).toEqual({
      citations: [
        {
          sourceId: "client_portfolio_review:review-ackermann-family-office",
          label: "Client Portfolio Review · Ackermann Family Office",
          dataset: "client_portfolio_review",
          rowId: "review-ackermann-family-office",
        },
      ],
    });
    expect(completed?.metadata).toEqual(persistedMetadata);
  });

  it("persists generated report attachments with the assistant message", async () => {
    let persistedMetadata: Record<string, unknown> | undefined;
    const deps: StreamChatDeps = {
      ...baseDeps,
      model: {
        async *stream() {
          yield {
            kind: "tool",
            toolCallId: "tool-report-1",
            toolName: "generate_workbench_report",
            status: "completed",
            output: {
              reportId: "report-1",
              fileName: "report-1.pdf",
              reportUrl: "http://127.0.0.1:3000/reports/report-1.pdf",
              title: "UBS Partner Workbench Briefing",
              pages: 1,
              sections: ["kpis"],
            },
          };
          yield {
            kind: "delta",
            text: "Report ready.",
          };
          yield {
            kind: "done",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      },
      conversations: {
        ...baseDeps.conversations,
        async appendAssistantMessage(
          _conversationId,
          _messageId,
          _content,
          _model,
          metadata,
        ) {
          persistedMetadata = metadata;
        },
      },
    };

    await collect(deps, validRequest);

    expect(persistedMetadata).toEqual({
      attachments: [
        {
          id: "tool-report-1",
          name: "UBS Partner Workbench Briefing.pdf",
          url: "http://127.0.0.1:3000/reports/report-1.pdf",
          mediaType: "application/pdf",
        },
      ],
    });
  });

  it("selects up to two explicitly named inline citations", () => {
    const sources = [
      {
        sourceId: "top_risk_accounts:risk-global-medtech",
        label: "Top Risk Accounts · Global MedTech Inc.",
        dataset: "top_risk_accounts" as const,
        rowId: "risk-global-medtech",
      },
      {
        sourceId: "top_risk_accounts:risk-jasper-retail",
        label: "Top Risk Accounts · Jasper Retail Group",
        dataset: "top_risk_accounts" as const,
        rowId: "risk-jasper-retail",
      },
    ];

    expect(
      selectInlineCitationSources(
        "High-priority outreach should start with Global MedTech Inc. and Jasper Retail Group.",
        sources,
      ),
    ).toEqual(sources);
  });

  it("falls back to one inline citation when the answer does not name rows", () => {
    const sources = [
      {
        sourceId: "top_risk_accounts:risk-global-medtech",
        label: "Top Risk Accounts · Global MedTech Inc.",
        dataset: "top_risk_accounts" as const,
        rowId: "risk-global-medtech",
      },
      {
        sourceId: "top_risk_accounts:risk-jasper-retail",
        label: "Top Risk Accounts · Jasper Retail Group",
        dataset: "top_risk_accounts" as const,
        rowId: "risk-jasper-retail",
      },
    ];

    expect(selectInlineCitationSources("Use the high-priority rows.", sources)).toEqual([
      sources[0],
    ]);
  });

  it("does not fall back to current surface row citations for unrelated answers", () => {
    const sources = [
      {
        sourceId: "advisoryWorklist:review-redwood-pharma-ag",
        label: "Portfolio Worklist Â· Redwood Pharma AG",
        dataset: "client_portfolio_review" as const,
        resourceId: "advisoryWorklist",
        rowId: "review-redwood-pharma-ag",
      },
    ];

    expect(selectInlineCitationSources("Hello! How can I help?", sources)).toEqual(
      [],
    );
  });

  it("keeps current surface row citations when the answer names the row", () => {
    const sources = [
      {
        sourceId: "advisoryWorklist:review-redwood-pharma-ag",
        label: "Portfolio Worklist Â· Redwood Pharma AG",
        dataset: "client_portfolio_review" as const,
        resourceId: "advisoryWorklist",
        rowId: "review-redwood-pharma-ag",
      },
    ];

    expect(
      selectInlineCitationSources(
        "Redwood Pharma AG is the first overdue portfolio to review.",
        sources,
      ),
    ).toEqual(sources);
  });

  it("throws ModelUnavailable for unsupported models", async () => {
    const deps = {
      ...baseDeps,
      config: {
        ...baseDeps.config,
        models() {
          return [{ provider: "openai", id: "other-model" }];
        },
      },
    };

    await expect(collect(deps, validRequest)).rejects.toBeInstanceOf(
      ModelUnavailable,
    );
  });

  it("throws Unauthorized when auth denies", async () => {
    const deps = {
      ...baseDeps,
      auth: {
        async authorize() {
          return false;
        },
      },
    };
    await expect(collect(deps, validRequest)).rejects.toBeInstanceOf(
      Unauthorized,
    );
  });

  it("throws RateLimited when rate limit check fails", async () => {
    const deps = {
      ...baseDeps,
      rateLimit: {
        async check() {
          return false;
        },
      },
    };
    await expect(collect(deps, validRequest)).rejects.toBeInstanceOf(
      RateLimited,
    );
  });

  it("throws BillingDenied when billing boundary denies workspace", async () => {
    const deps = {
      ...baseDeps,
      billing: {
        async allow() {
          return false;
        },
      },
    };
    await expect(collect(deps, validRequest)).rejects.toBeInstanceOf(
      BillingDenied,
    );
  });

  it("throws UsageCaptureFailed when usage persistence fails", async () => {
    const deps = {
      ...baseDeps,
      usage: {
        async record() {
          throw new Error("store unavailable");
        },
      },
    };

    await expect(collect(deps, validRequest)).rejects.toBeInstanceOf(
      UsageCaptureFailed,
    );
  });
});
