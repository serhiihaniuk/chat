import type {
  ModelPort,
  WorkbenchQueryName,
  WorkbenchReportInput,
} from "#ports/index.js";
import type { HostCommand } from "@side-chat/shared-protocol";

/**
 * Deterministic model adapter for tests and local safety. It exercises the same
 * stream contract as the real adapter without making provider requests.
 */
export type FakeModelAdapterOptions = {
  chunkDelayMs?: number;
};

const defaultChunkDelayMs = 90;

const wordCount = (content: string) =>
  content.trim().split(/\s+/).filter(Boolean).length;

const parseChunkDelayMs = () => {
  const value = Number(process.env.SIDE_CHAT_FAKE_CHUNK_DELAY_MS);
  return Number.isFinite(value) && value >= 0 ? value : defaultChunkDelayMs;
};

const wait = (delayMs: number, signal?: AbortSignal) => {
  if (delayMs <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new Error("fake stream aborted"));

  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timeout = globalThis.setTimeout(finish, delayMs);
    const abort = () => {
      globalThis.clearTimeout(timeout);
      reject(new Error("fake stream aborted"));
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
};

const createResponseChunks = (modelId: string, prompt: string) => [
  "# Assistant answer\n",
  `Model **${modelId}** received: ${prompt}\n\n`,
  "## Mocked streaming process\n",
  "- deterministic mocked streaming\n- markdown-ready output\n- visible chunk-by-chunk delivery for local UX testing\n\n",
  "> Mock insight: this response is intentionally richer than a plain echo so the widget can exercise markdown, spacing, and scroll behavior.\n\n",
  "| Feature | Demo value |\n| --- | --- |\n| Tables | Supported |\n| Lists | Ordered and unordered |\n| Code | Inline and fenced blocks |\n\n",
  "1. Parse the workspace context.\n2. Summarize the user's request.\n3. Suggest a concrete next action.\n\n",
  "Here is `inline code` and a TypeScript block:\n",
  "```ts\nconst x = 1;\nconst featureFlags = ['streaming', 'markdown', 'tables'];\n```\n",
  "### Suggested next actions\n- [ ] Review the highlighted metrics\n- [ ] Ask a follow-up question\n- [ ] Compare the response between available models\n",
];

const isGenericReportRequest = (content: string) =>
  /\b(generate|create|export|build|make)\b/i.test(content) &&
  /\b(report|pdf|briefing)\b/i.test(content) &&
  !/\b(default|defaults|go ahead|proceed|executive_summary|risk_review|client_coverage|portfolio_allocation|kpis|biggest_clients|risk_accounts|product_allocation|net_new_money_trend)\b/i.test(
    content,
  );

const isReportContinuationRequest = (content: string) =>
  /^\s*[12]\s*(?:$|[.)-])/i.test(content) ||
  /\b(default|defaults|go ahead|proceed|generate it|create it|use option|option [12]|executive_summary|executive summary|risk_review|risk review|client_coverage|client coverage|portfolio_allocation|portfolio allocation|kpis|biggest_clients|biggest clients|risk_accounts|risk accounts|product_allocation|product allocation|net_new_money_trend|net new money trend|analyst note|suitability|rationale|next action|custom wording)\b/i.test(
    content,
  );

const shouldGenerateReport = (content: string) =>
  (/\b(generate|create|export|build|make)\b/i.test(content) &&
    /\b(report|pdf|briefing)\b/i.test(content) &&
    !isGenericReportRequest(content)) ||
  isReportContinuationRequest(content);

const resolveHostCommand = (content: string): HostCommand | undefined => {
  if (/\b(this week|next week|next 7 days|next seven days|next 14 days|next two weeks|this month|due today|today)\b/i.test(content)) {
    const dueWindow = resolveDueWindow(content);
    return {
      type: "grid.applyView",
      resourceId: "advisoryWorklist",
      view: {
        filters: [
          {
            columnId: "dueDate",
            operator: "between",
            value: dueWindow,
          },
        ],
        sort: [{ columnId: "dueDate", direction: "asc" }],
      },
    };
  }

  if (/\b(best performing|top performing|strongest flow|best portfolios)\b/i.test(content)) {
    return {
      type: "grid.applyView",
      resourceId: "advisoryWorklist",
      view: {
        sort: [{ columnId: "netFlow30dChf", direction: "desc" }],
      },
    };
  }

  if (/\b(highest risk|riskiest|sorted by risk|at risk portfolios)\b/i.test(content)) {
    return {
      type: "grid.applyView",
      resourceId: "advisoryWorklist",
      view: {
        filters: [
          {
            columnId: "coverageStatus",
            operator: "equals",
            value: "At Risk",
          },
        ],
        sort: [{ columnId: "riskScore", direction: "asc" }],
      },
    };
  }

  if (/\b(overdue|past due|late tasks|due first|risk queue)\b/i.test(content)) {
    return {
      type: "grid.applyView",
      resourceId: "advisoryWorklist",
      view: {
        filters: [
          {
            columnId: "dueStatus",
            operator: "equals",
            value: "Overdue",
          },
        ],
        sort: [{ columnId: "dueDate", direction: "asc" }],
      },
    };
  }

  if (/\b(open portfolios|only open|due status open)\b/i.test(content)) {
    return {
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
    };
  }

  return undefined;
};

const resolveDueWindow = (content: string) => {
  const today = todayUtc();
  if (/\b(next 14 days|next two weeks)\b/i.test(content)) {
    return [formatIsoDate(today), formatIsoDate(addDays(today, 14))];
  }
  if (/\b(next week|next 7 days|next seven days)\b/i.test(content)) {
    return [formatIsoDate(today), formatIsoDate(addDays(today, 7))];
  }
  if (/\b(this month)\b/i.test(content)) {
    return [formatIsoDate(startOfMonth(today)), formatIsoDate(endOfMonth(today))];
  }
  if (/\b(today|due today)\b/i.test(content)) {
    return [formatIsoDate(today), formatIsoDate(today)];
  }
  return [formatIsoDate(startOfWeek(today)), formatIsoDate(endOfWeek(today))];
};

const dayMs = 24 * 60 * 60 * 1000;

const todayUtc = () => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

const addDays = (value: number, days: number) => value + days * dayMs;

const startOfWeek = (value: number) => {
  const date = new Date(value);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(value, mondayOffset);
};

const endOfWeek = (value: number) => addDays(startOfWeek(value), 6);

const startOfMonth = (value: number) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};

const endOfMonth = (value: number) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0);
};

const formatIsoDate = (value: number) => new Date(value).toISOString().slice(0, 10);

const createHostCommandResponse = (command: HostCommand) => {
  if (command.type === "grid.applyView" && command.resourceId === "advisoryWorklist") {
    return "I updated the Portfolio Worklist with the requested filter and sort.";
  }
  return "I updated the dashboard view.";
};

const resolveWorkbenchQuery = (content: string): WorkbenchQueryName | undefined => {
  if (/\b(biggest|largest|second biggest|client|aum)\b/i.test(content)) {
    return "client_portfolio_review";
  }
  if (/\b(risk|at risk|highest risk|priority|exposure)\b/i.test(content)) {
    return "top_risk_accounts";
  }
  if (/\b(allocation|asset class|drift|portfolio mix)\b/i.test(content)) {
    return "product_allocation";
  }
  if (/\b(net new money|money trend|trend|flow|inflow|outflow)\b/i.test(content)) {
    return "net_new_money_trend";
  }
  if (/\b(kpi|summary|summarize|page|dashboard|total aum|advisory coverage|alerts)\b/i.test(content)) {
    return "dashboard_snapshot";
  }

  return undefined;
};

const reportClarificationChunks = [
  "I can generate that PDF report. Choose one of these, or say **use defaults** and I will create the standard one-page executive snapshot.\n\n",
  "**Option 1 (recommended): Default executive snapshot**\n",
  "- Focus: Executive summary\n",
  "- Sections: KPIs, biggest clients, risk accounts, product allocation, and Net New Money trend\n",
  "Reply **1** or **use defaults**.\n\n",
  "**Option 2: Custom report**\n",
  "- Focus: Executive summary, Risk review, Client coverage, or Portfolio allocation\n",
  "- Sections: KPIs, biggest clients, risk accounts, product allocation, and Net New Money trend\n",
  "- Optional analyst note: Risk rationale, Next action, or Custom wording\n",
  "Reply in plain language, for example: **Risk review with KPIs, risk accounts, and Net New Money trend. Add a next-action note for RM handoff.**",
];

export const createFakeModelAdapter = (
  options: FakeModelAdapterOptions = {},
): ModelPort => ({
  async *stream(request, signal) {
    if (request.message.content.toLowerCase().includes("fail")) {
      throw new Error("fake model failure");
    }

    const hostCommand = resolveHostCommand(request.message.content);
    if (hostCommand) {
      yield {
        kind: "host-command",
        commandId: "fake-host-command-1",
        command: hostCommand,
      };
    }

    let surfaceAnswerChunks: string[] | undefined;
    if (
      request.workbenchTools?.surfaceContext &&
      /\b(how many|count|currently filtered|visible|open portfolios|on this page|present in the table|in the table|this table|what do we do now|what needs attention|pay attention)\b/i.test(
        request.message.content,
      ) &&
      !hostCommand
    ) {
      const input = { resourceId: "advisoryWorklist", limit: 12 };
      yield {
        kind: "tool",
        toolCallId: "fake-workbench-surface-context-1",
        toolName: "workbench_surface_context",
        status: "running",
        input,
      };
      const output = await request.workbenchTools.surfaceContext({
        workspaceId: request.workspaceId,
        userId: request.userId ?? "local-user",
        conversationId: request.conversationId,
        pageContext: request.pageContext,
        ...input,
      });
      yield {
        kind: "tool",
        toolCallId: "fake-workbench-surface-context-1",
        toolName: "workbench_surface_context",
        status: "completed",
        input,
        output,
      };
      const firstRow = output.rows[0];
      surfaceAnswerChunks = /\b(which|what|attention|do now|needs attention|pay attention)\b/i.test(
        request.message.content,
      ) && firstRow
        ? [
            `Focus first on **${firstRow.label}** in the current Portfolio Worklist view. It is the top visible row after the active filters and sort.`,
          ]
        : [
            `The current Portfolio Worklist view has **${output.rowCount}** rows visible out of ${output.totalRowCount}.`,
          ];
    }

    const chunks = surfaceAnswerChunks ?? (hostCommand
      ? [createHostCommandResponse(hostCommand)]
      : isGenericReportRequest(request.message.content)
      ? reportClarificationChunks
      : createResponseChunks(request.model.id, request.message.content));
    const chunkDelayMs = options.chunkDelayMs ?? parseChunkDelayMs();

    const workbenchQuery = resolveWorkbenchQuery(request.message.content);
    if (
      request.workbenchTools &&
      workbenchQuery &&
      !hostCommand &&
      !isGenericReportRequest(request.message.content)
    ) {
      const input = { query: workbenchQuery };
      yield {
        kind: "tool",
        toolCallId: "fake-workbench-query-1",
        toolName: "workbench_query",
        status: "running",
        input,
      };
      const output = await request.workbenchTools?.query({
        workspaceId: request.workspaceId,
        userId: request.userId ?? "local-user",
        conversationId: request.conversationId,
        pageContext: request.pageContext,
        query: input,
      });
      yield {
        kind: "tool",
        toolCallId: "fake-workbench-query-1",
        toolName: "workbench_query",
        status: "completed",
        input,
        output,
      };
    }

    if (
      request.workbenchReports &&
      request.workbenchTools &&
      shouldGenerateReport(request.message.content) &&
      !isGenericReportRequest(request.message.content)
    ) {
      const input: WorkbenchReportInput = {
        title: "UBS Partner Workbench Briefing",
        focus: "executive_summary" as const,
        sections: ["kpis", "biggest_clients", "risk_accounts"],
        noteKind: "next_action",
        note: "Use this briefing for RM handoff; confirm flagged risks and coverage status before client outreach.",
      };
      yield {
        kind: "tool",
        toolCallId: "fake-workbench-report-1",
        toolName: "generate_workbench_report",
        status: "running",
        input,
      };
      const output = await request.workbenchReports.generate({
        workspaceId: request.workspaceId,
        userId: request.userId ?? "local-user",
        pageContext: request.pageContext,
        report: input,
        workbenchTools: request.workbenchTools,
      });
      yield {
        kind: "tool",
        toolCallId: "fake-workbench-report-1",
        toolName: "generate_workbench_report",
        status: "completed",
        input,
        output,
      };
    }

    for (const text of chunks) {
      await wait(chunkDelayMs, signal);
      yield { kind: "delta", text };
    }

    const inputTokens = wordCount(request.message.content);
    const outputTokens = wordCount(chunks.join(" "));
    if (request.model.reasoningEffort && request.model.reasoningEffort !== "none") {
      yield {
        kind: "reasoning",
        text: "I identified the workspace question, checked the relevant dashboard context, and planned a concise answer.",
      };
    }
    yield {
      kind: "done",
      finishReason: "stop",
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        reasoningTokens:
          request.model.reasoningEffort && request.model.reasoningEffort !== "none"
            ? 12
            : 0,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
      },
    };
  },
});

export const fakeModelAdapter: ModelPort = createFakeModelAdapter();
