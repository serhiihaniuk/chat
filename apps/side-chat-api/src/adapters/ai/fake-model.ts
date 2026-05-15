import type { ModelPort, WorkbenchReportInput } from "../../ports/index.js";

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
  /\b(default|defaults|go ahead|proceed|generate it|create it|use option|option [12]|executive_summary|executive summary|risk_review|risk review|client_coverage|client coverage|portfolio_allocation|portfolio allocation|kpis|biggest_clients|biggest clients|risk_accounts|risk accounts|product_allocation|product allocation|net_new_money_trend|net new money trend|analyst note)\b/i.test(
    content,
  );

const shouldGenerateReport = (content: string) =>
  (/\b(generate|create|export|build|make)\b/i.test(content) &&
    /\b(report|pdf|briefing)\b/i.test(content) &&
    !isGenericReportRequest(content)) ||
  isReportContinuationRequest(content);

const reportClarificationChunks = [
  "I can generate that PDF report. Before I do, choose one of these, or say **use defaults** and I’ll create the standard one-page executive snapshot.\n\n",
  "- **Focus:** executive summary, risk review, client coverage, or portfolio allocation\n",
  "- **Sections:** KPIs, biggest clients, risk accounts, product allocation, net-new-money trend\n",
  "- **Analyst note:** optional short line to include at the top\n\n",
  "Default: executive summary with KPIs, biggest clients, risk accounts, product allocation, and net-new-money trend.",
];

export const createFakeModelAdapter = (
  options: FakeModelAdapterOptions = {},
): ModelPort => ({
  async *stream(request, signal) {
    if (request.message.content.toLowerCase().includes("fail")) {
      throw new Error("fake model failure");
    }

    const chunks = isGenericReportRequest(request.message.content)
      ? reportClarificationChunks
      : createResponseChunks(request.model.id, request.message.content);
    const chunkDelayMs = options.chunkDelayMs ?? parseChunkDelayMs();

    if (request.message.content.toLowerCase().includes("tool")) {
      const input = { query: "dashboard_snapshot" as const };
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
        note: "Generated from approved workbench data.",
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
